import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { getTokenUsageByDateRange } from "@/lib/db/queries";
import { isDevelopmentEnvironment } from "@/lib/constants";

export const maxDuration = 60;

// Helper function to check if user email is from fddigital.com
// In development mode, allow any authenticated user for testing
function isAdminUser(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  
  // Allow all authenticated users in development mode
  if (isDevelopmentEnvironment) {
    return true;
  }
  
  return email.endsWith("@fddigital.com");
}

// Model pricing (per 1K tokens) - approximate values
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; provider: string }
> = {
  // OpenAI
  "openai/gpt-5.2": { input: 0.03, output: 0.06, provider: "openai" },
  "openai/gpt-4.1-mini": { input: 0.0015, output: 0.002, provider: "openai" },
  // Anthropic
  "anthropic/claude-opus-4.5": { input: 0.015, output: 0.075, provider: "anthropic" },
  "anthropic/claude-sonnet-4.5": { input: 0.003, output: 0.015, provider: "anthropic" },
  "anthropic/claude-haiku-4.5": { input: 0.00025, output: 0.00125, provider: "anthropic" },
  // Google
  "google/gemini-3-pro-preview": { input: 0.00125, output: 0.005, provider: "google" },
  "google/gemini-2.5-flash-lite": { input: 0.000075, output: 0.0003, provider: "google" },
  // xAI
  "xai/grok-4.1-fast-non-reasoning": { input: 0.002, output: 0.01, provider: "xai" },
};

// Whisper pricing: $0.006 per minute
const WHISPER_COST_PER_SECOND = 0.006 / 60;

function calculateCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[modelId] || { input: 0.001, output: 0.002 };
  return (
    (promptTokens / 1000) * pricing.input +
    (completionTokens / 1000) * pricing.output
  );
}

function calculateTranscriptionCost(audioSeconds: number): number {
  return audioSeconds * WHISPER_COST_PER_SECOND;
}

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // Check if user is admin (fddigital.com email)
    if (!isAdminUser(session.user.email)) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    const { searchParams } = new URL(request.url);
    const days = Number.parseInt(searchParams.get("days") || "7", 10);

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const usage = await getTokenUsageByDateRange({
      startDate,
      endDate,
    });

    // Aggregate data by model
    const modelStats: Record<
      string,
      {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        audioSeconds?: number;
        requestCount: number;
        cost: number;
        provider: string;
        usageType: string;
      }
    > = {};

    // Daily usage for timeline
    const dailyUsage: Record<
      string,
      {
        date: string;
        totalTokens: number;
        audioSeconds: number;
        cost: number;
      }
    > = {};

    for (const record of usage) {
      const modelId = record.modelId;
      const usageType = record.usageType || "chat";
      
      let cost = 0;
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let audioSeconds = 0;

      if (usageType === "transcription") {
        // Handle transcription usage
        audioSeconds = record.audioSeconds ? Number.parseFloat(record.audioSeconds) : 0;
        cost = calculateTranscriptionCost(audioSeconds);
      } else {
        // Handle chat usage
        promptTokens = record.promptTokens ? Number.parseInt(record.promptTokens, 10) : 0;
        completionTokens = record.completionTokens ? Number.parseInt(record.completionTokens, 10) : 0;
        totalTokens = record.totalTokens ? Number.parseInt(record.totalTokens, 10) : 0;
        cost = calculateCost(modelId, promptTokens, completionTokens);
      }

      // Aggregate by model
      if (!modelStats[modelId]) {
        const pricing = MODEL_PRICING[modelId];
        modelStats[modelId] = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          audioSeconds: 0,
          requestCount: 0,
          cost: 0,
          provider: usageType === "transcription" ? "openai" : (pricing?.provider || "unknown"),
          usageType,
        };
      }

      modelStats[modelId].promptTokens += promptTokens;
      modelStats[modelId].completionTokens += completionTokens;
      modelStats[modelId].totalTokens += totalTokens;
      if (usageType === "transcription") {
        modelStats[modelId].audioSeconds = (modelStats[modelId].audioSeconds || 0) + audioSeconds;
      }
      modelStats[modelId].requestCount += 1;
      modelStats[modelId].cost += cost;

      // Aggregate by day
      const dateKey = record.createdAt.toISOString().split("T")[0];
      if (!dailyUsage[dateKey]) {
        dailyUsage[dateKey] = {
          date: dateKey,
          totalTokens: 0,
          audioSeconds: 0,
          cost: 0,
        };
      }
      dailyUsage[dateKey].totalTokens += totalTokens;
      dailyUsage[dateKey].audioSeconds += audioSeconds;
      dailyUsage[dateKey].cost += cost;
    }

    // Convert to arrays and sort
    const modelStatsArray = Object.entries(modelStats).map(
      ([modelId, stats]) => ({
        modelId,
        ...stats,
      })
    );

    const dailyUsageArray = Object.values(dailyUsage).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Calculate totals
    const totals = {
      totalRequests: usage.length,
      totalTokens: modelStatsArray.reduce(
        (sum, model) => sum + model.totalTokens,
        0
      ),
      totalAudioSeconds: modelStatsArray.reduce(
        (sum, model) => sum + (model.audioSeconds || 0),
        0
      ),
      totalCost: modelStatsArray.reduce((sum, model) => sum + model.cost, 0),
      totalPromptTokens: modelStatsArray.reduce(
        (sum, model) => sum + model.promptTokens,
        0
      ),
      totalCompletionTokens: modelStatsArray.reduce(
        (sum, model) => sum + model.completionTokens,
        0
      ),
    };

    return Response.json(
      {
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          days,
        },
        totals,
        modelStats: modelStatsArray,
        dailyUsage: dailyUsageArray,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to get analytics:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}

