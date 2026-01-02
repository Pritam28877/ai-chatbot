import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import {
  createSavedPrompt,
  getSavedPromptsByUserId,
} from "@/lib/db/queries";
import { z } from "zod";

export const maxDuration = 60;

const createPromptSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1).max(5000),
  category: z.string().max(64).optional(),
});

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const prompts = await getSavedPromptsByUserId({
      userId: session.user.id,
    });

    return Response.json(prompts, { status: 200 });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to get saved prompts:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const json = await request.json();
    const parsed = createPromptSchema.parse(json);

    const [newPrompt] = await createSavedPrompt({
      userId: session.user.id,
      title: parsed.title,
      content: parsed.content,
      category: parsed.category,
    });

    return Response.json(newPrompt, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to create saved prompt:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}

