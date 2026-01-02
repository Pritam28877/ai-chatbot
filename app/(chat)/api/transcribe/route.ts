import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { saveTranscriptionUsage } from "@/lib/db/queries";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const formData = await request.formData();
    const audio = formData.get("audio") as File;
    const chatId = formData.get("chatId") as string;

    if (!audio) {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    if (!chatId) {
      return Response.json(
        { error: "chatId is required" },
        { status: 400 }
      );
    }

    // OpenAI Whisper API expects the audio in multipart/form-data format
    const whisperFormData = new FormData();
    whisperFormData.append("file", audio);
    whisperFormData.append("model", "whisper-1");
    whisperFormData.append("timestamp_granularities[]", "segment");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: whisperFormData,
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("Whisper API error:", error);
      return Response.json(
        { error: "Failed to transcribe audio" },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Track transcription usage if available
    if (data.usage?.seconds) {
      try {
        await saveTranscriptionUsage({
          chatId,
          userId: session.user.id,
          modelId: "whisper-1",
          audioSeconds: data.usage.seconds,
        });
        console.log(
          `[Transcription] Saved usage: ${data.usage.seconds} seconds for chat ${chatId}`
        );
      } catch (error) {
        console.error("Failed to save transcription usage:", error);
        // Don't fail the request if usage tracking fails
      }
    }

    return Response.json({ text: data.text }, { status: 200 });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to transcribe audio:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}

