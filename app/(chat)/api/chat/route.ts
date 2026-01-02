import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  saveTokenUsage,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { TokenCounter } from "@/lib/utils/token-counter";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes("REDIS_URL")) {
        console.log(
          " > Resumable streams are disabled due to missing REDIS_URL"
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    // Check if this is a tool approval flow (all messages sent)
    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      // Only fetch messages if chat already exists and not tool approval
      if (!isToolApprovalFlow) {
        messagesFromDb = await getMessagesByChatId({ id });
      }
    } else if (message?.role === "user") {
      // Save chat immediately with placeholder title
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });

      // Start title generation in parallel (don't await)
      titlePromise = generateTitleFromUserMessage({ message });
    }

    // Use all messages for tool approval, otherwise DB messages + new message
    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    // Only save user messages to the database (not tool approval responses)
    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // Store token usage data to save after stream completes
    let tokenUsageData: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    } | null = null;

    // Store estimated input tokens for manual counting fallback
    let estimatedInputTokens: { inputTokens: number } | null = null;

    const stream = createUIMessageStream({
      // Pass original messages for tool approval continuation
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        // Handle title generation in parallel
        if (titlePromise) {
          titlePromise.then((title) => {
            updateChatTitleById({ chatId: id, title });
            dataStream.write({ type: "data-chat-title", data: title });
          });
        }

        const isReasoningModel =
          selectedChatModel.includes("reasoning") ||
          selectedChatModel.includes("thinking");

        console.log(
          `[Chat ${id}] Starting streamText for model: ${selectedChatModel}`
        );

        // Pre-count input tokens for fallback
        const modelMessages = await convertToModelMessages(uiMessages);
        const systemPromptText = systemPrompt({
          selectedChatModel,
          requestHints,
        });
        estimatedInputTokens = await TokenCounter.countTokens(
          modelMessages,
          systemPromptText,
          selectedChatModel
        );
        console.log(
          `[Chat ${id}] Estimated input tokens:`,
          estimatedInputTokens.inputTokens
        );

        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: systemPromptText,
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: isReasoningModel
            ? []
            : [
                "getWeather",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
              ],
          experimental_transform: isReasoningModel
            ? undefined
            : smoothStream({ chunking: "word" }),
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          })
        );

        // Capture token usage using the result.usage Promise (recommended approach)
        // This is more reliable than onFinish callback with AI Gateway
        // If the AI Gateway doesn't return token usage, we'll manually count tokens
        result.usage
          .then((usageData) => {
            console.log(`[Chat ${id}] result.usage Promise resolved`);
            console.log(
              `[Chat ${id}] usage data:`,
              JSON.stringify(usageData, null, 2)
            );

            if (usageData) {
              const inputTokens = usageData.inputTokens ?? 0;
              const outputTokens = usageData.outputTokens ?? 0;
              const total = usageData.totalTokens ?? inputTokens + outputTokens;

              console.log(
                `[Chat ${id}] Parsed tokens - input: ${inputTokens}, output: ${outputTokens}, total: ${total}`
              );

              // If the AI Gateway returns 0 tokens, use manual counting as fallback
              if (total > 0) {
                tokenUsageData = {
                  promptTokens: inputTokens,
                  completionTokens: outputTokens,
                  totalTokens: total,
                };
                console.log(
                  `[Chat ${id}] Token usage captured from AI Gateway:`,
                  tokenUsageData
                );
              } else {
                console.warn(
                  `[Chat ${id}] AI Gateway returned 0 tokens, will use manual counting fallback`
                );
              }
            } else {
              console.warn(
                `[Chat ${id}] usage Promise returned null/undefined`
              );
            }
          })
          .catch((error) => {
            console.error(
              `[Chat ${id}] Error getting usage from Promise:`,
              error
            );
          });
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        console.log(`[Chat ${id}] createUIMessageStream onFinish called`);
        console.log(`[Chat ${id}] tokenUsageData before save:`, tokenUsageData);

        // Save messages first
        if (isToolApprovalFlow) {
          // For tool approval, update existing messages (tool state changed) and save new ones
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              // Update existing message with new parts (tool state changed)
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              // Save new message
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          // Normal flow - save all finished messages
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }

        // Save token usage after messages are saved
        if (tokenUsageData) {
          try {
            console.log(`[Chat ${id}] Saving token usage to database:`, {
              chatId: id,
              userId: session.user.id,
              modelId: selectedChatModel,
              ...tokenUsageData,
            });
            await saveTokenUsage({
              chatId: id,
              userId: session.user.id,
              modelId: selectedChatModel,
              ...tokenUsageData,
            });
            console.log(`[Chat ${id}] Token usage saved successfully!`);
          } catch (error) {
            console.error(`[Chat ${id}] Failed to save token usage:`, error);
            // Don't fail the request if token tracking fails
          }
        } else {
          // Fallback: manually count tokens if AI Gateway didn't return usage
          console.warn(
            `[Chat ${id}] No token usage data from AI Gateway, using manual counting fallback`
          );
          try {
            // Count output tokens from the assistant's response
            const assistantMessages = finishedMessages.filter(
              (msg) => msg.role === "assistant"
            );
            let outputText = "";
            for (const msg of assistantMessages) {
              if (Array.isArray(msg.parts)) {
                for (const part of msg.parts) {
                  if (part.type === "text") {
                    outputText += part.text;
                  }
                }
              }
            }

            const estimatedOutputTokens = TokenCounter.countOutputTokens(
              outputText,
              selectedChatModel
            );

            const manualTokenUsage = {
              promptTokens: estimatedInputTokens?.inputTokens ?? 0,
              completionTokens: estimatedOutputTokens,
              totalTokens:
                (estimatedInputTokens?.inputTokens ?? 0) +
                estimatedOutputTokens,
            };

            console.log(
              `[Chat ${id}] Manually counted tokens:`,
              manualTokenUsage
            );

            await saveTokenUsage({
              chatId: id,
              userId: session.user.id,
              modelId: selectedChatModel,
              ...manualTokenUsage,
            });

            console.log(
              `[Chat ${id}] Manually counted token usage saved successfully!`
            );
          } catch (error) {
            console.error(
              `[Chat ${id}] Failed to manually count/save tokens:`,
              error
            );
          }
        }
      },
      onError: () => {
        return "Oops, an error occurred!";
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      try {
        const resumableStream = await streamContext.resumableStream(
          streamId,
          () => stream.pipeThrough(new JsonToSseTransformStream())
        );
        if (resumableStream) {
          return new Response(resumableStream);
        }
      } catch (error) {
        console.error("Failed to create resumable stream:", error);
      }
    }

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    // Check for Vercel AI Gateway credit card error
    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
