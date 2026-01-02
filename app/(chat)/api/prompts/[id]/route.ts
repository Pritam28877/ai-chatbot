import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import {
  updateSavedPrompt,
  deleteSavedPrompt,
  incrementPromptUseCount,
} from "@/lib/db/queries";
import { z } from "zod";

export const maxDuration = 60;

const updatePromptSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).max(5000).optional(),
  category: z.string().max(64).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { id } = await params;
    const json = await request.json();
    const parsed = updatePromptSchema.parse(json);

    const [updatedPrompt] = await updateSavedPrompt({
      id,
      userId: session.user.id,
      ...parsed,
    });

    if (!updatedPrompt) {
      return new ChatSDKError("not_found:chat").toResponse();
    }

    return Response.json(updatedPrompt, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new ChatSDKError("bad_request:api").toResponse();
    }

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to update saved prompt:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { id } = await params;

    const [deletedPrompt] = await deleteSavedPrompt({
      id,
      userId: session.user.id,
    });

    if (!deletedPrompt) {
      return new ChatSDKError("not_found:chat").toResponse();
    }

    return Response.json(deletedPrompt, { status: 200 });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to delete saved prompt:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    if (action === "use") {
      // Increment use count when prompt is used
      const result = await incrementPromptUseCount({ id });

      if (!result) {
        return new ChatSDKError("not_found:chat").toResponse();
      }

      return Response.json({ success: true }, { status: 200 });
    }

    return new ChatSDKError("bad_request:api").toResponse();
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to process prompt action:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}

