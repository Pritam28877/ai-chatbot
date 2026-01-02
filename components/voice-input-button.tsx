"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MicIcon, StopCircleIcon } from "lucide-react";
import { toast } from "sonner";

export function VoiceInputButton({
  onTranscript,
  disabled,
  chatId,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  chatId: string;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
        
        // Stop all tracks to release the microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.success("Recording started...");
    } catch (error) {
      console.error("Error starting recording:", error);
      toast.error(
        "Failed to start recording. Please check microphone permissions."
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("chatId", chatId);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      }

      const data = await response.json();
      onTranscript(data.text);
      toast.success("Audio transcribed successfully!");
    } catch (error) {
      console.error("Error transcribing audio:", error);
      toast.error("Failed to transcribe audio. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="voice-input-button"
      disabled={disabled || isProcessing}
      onClick={isRecording ? stopRecording : startRecording}
      variant="ghost"
    >
      {isProcessing ? (
        <div className="size-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      ) : isRecording ? (
        <StopCircleIcon
          className="animate-pulse text-red-500"
          size={14}
          style={{ width: 14, height: 14 }}
        />
      ) : (
        <MicIcon size={14} style={{ width: 14, height: 14 }} />
      )}
    </Button>
  );
}

