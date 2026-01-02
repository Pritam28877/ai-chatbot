import { encodingForModel } from "js-tiktoken";
import type { CoreMessage } from "ai";

// Model-specific token counter
// For models that don't report usage, we estimate using js-tiktoken
export class TokenCounter {
  private static getEncodingModelName(modelId: string): string {
    // Map AI Gateway model IDs to tiktoken models
    if (modelId.includes("gpt-4")) {
      return "gpt-4";
    }
    if (modelId.includes("gpt-3.5")) {
      return "gpt-3.5-turbo";
    }
    // Default to gpt-4 for estimation
    // Note: Gemini models use different tokenization, but gpt-4 is a reasonable approximation
    return "gpt-4";
  }

  static async countTokens(
    messages: CoreMessage[],
    systemPrompt: string,
    modelId: string
  ): Promise<{ inputTokens: number }> {
    try {
      const modelName = this.getEncodingModelName(modelId);
      const encoding = encodingForModel(modelName);

      let totalTokens = 0;

      // Count system prompt tokens
      if (systemPrompt) {
        totalTokens += encoding.encode(systemPrompt).length;
      }

      // Count message tokens
      for (const message of messages) {
        if (typeof message.content === "string") {
          totalTokens += encoding.encode(message.content).length;
        } else if (Array.isArray(message.content)) {
          // Handle multi-part content (text + images/files)
          for (const part of message.content) {
            if (part.type === "text") {
              totalTokens += encoding.encode(part.text).length;
            }
            // Note: Images and other media types have different token costs
            // For simplicity, we're not counting them here
          }
        }
        // Add tokens for message formatting (role, etc.)
        // OpenAI estimates ~4 tokens per message for formatting
        totalTokens += 4;
      }

      // Add tokens for assistant response priming
      totalTokens += 3;

      return { inputTokens: totalTokens };
    } catch (error) {
      console.error("Error counting tokens:", error);
      // Return a rough estimate if js-tiktoken fails
      const roughEstimate = this.roughTokenEstimate(messages, systemPrompt);
      return { inputTokens: roughEstimate };
    }
  }

  static countOutputTokens(text: string, modelId: string): number {
    try {
      const modelName = this.getEncodingModelName(modelId);
      const encoding = encodingForModel(modelName);
      const tokens = encoding.encode(text).length;
      return tokens;
    } catch (error) {
      console.error("Error counting output tokens:", error);
      // Rough estimate: ~4 characters per token
      return Math.ceil(text.length / 4);
    }
  }

  private static roughTokenEstimate(
    messages: CoreMessage[],
    systemPrompt: string
  ): number {
    let totalChars = systemPrompt.length;

    for (const message of messages) {
      if (typeof message.content === "string") {
        totalChars += message.content.length;
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === "text") {
            totalChars += part.text.length;
          }
        }
      }
    }

    // Rough estimate: ~4 characters per token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Synchronously count tokens for a simple text string
   * This is useful for UI displays where we need instant feedback
   */
  static countTextTokens(text: string, modelId: string = "gpt-4"): number {
    try {
      const modelName = this.getEncodingModelName(modelId);
      const encoding = encodingForModel(modelName);
      const tokens = encoding.encode(text).length;
      return tokens;
    } catch (error) {
      console.error("Error counting text tokens:", error);
      // Rough estimate: ~4 characters per token
      return Math.ceil(text.length / 4);
    }
  }
}

