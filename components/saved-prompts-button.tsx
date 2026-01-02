"use client";

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { useDebounceValue } from "usehooks-ts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BookmarkIcon,
  PlusIcon,
  TrashIcon,
  Edit2Icon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TokenCounter } from "@/lib/utils/token-counter";

type SavedPrompt = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  useCount: string;
  createdAt: string;
  updatedAt: string;
};

export function SavedPromptsButton({
  onSelectPrompt,
}: {
  onSelectPrompt: (content: string, id: string) => void;
}) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState<SavedPrompt | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    content: "",
    category: "",
  });

  // Debounce content to avoid expensive token counting on every keystroke
  const [debouncedContent] = useDebounceValue(formData.content, 1000);

  // Calculate token count for form data content (only after user stops typing for 1s)
  const formTokenCount = useMemo(() => {
    return TokenCounter.countTextTokens(debouncedContent);
  }, [debouncedContent]);

  const fetchPrompts = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/prompts");
      if (response.ok) {
        const data = await response.json();
        setPrompts(data);
      } else {
        toast.error("Failed to load saved prompts");
      }
    } catch (error) {
      console.error("Error fetching prompts:", error);
      toast.error("Failed to load saved prompts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchPrompts();
    }
  }, [open]);

  const handleCreate = async () => {
    if (!formData.title || !formData.content) {
      toast.error("Title and content are required");
      return;
    }

    try {
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success("Prompt saved successfully");
        setCreateDialogOpen(false);
        setFormData({ title: "", content: "", category: "" });
        fetchPrompts();
      } else {
        toast.error("Failed to save prompt");
      }
    } catch (error) {
      console.error("Error creating prompt:", error);
      toast.error("Failed to save prompt");
    }
  };

  const handleUpdate = async () => {
    if (!currentPrompt || !formData.title || !formData.content) {
      toast.error("Title and content are required");
      return;
    }

    try {
      const response = await fetch(`/api/prompts/${currentPrompt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success("Prompt updated successfully");
        setEditDialogOpen(false);
        setCurrentPrompt(null);
        setFormData({ title: "", content: "", category: "" });
        fetchPrompts();
      } else {
        toast.error("Failed to update prompt");
      }
    } catch (error) {
      console.error("Error updating prompt:", error);
      toast.error("Failed to update prompt");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this prompt?")) {
      return;
    }

    try {
      const response = await fetch(`/api/prompts/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Prompt deleted successfully");
        fetchPrompts();
      } else {
        toast.error("Failed to delete prompt");
      }
    } catch (error) {
      console.error("Error deleting prompt:", error);
      toast.error("Failed to delete prompt");
    }
  };

  const handleSelectPrompt = async (prompt: SavedPrompt) => {
    // Increment use count
    await fetch(`/api/prompts/${prompt.id}?action=use`, {
      method: "POST",
    });

    onSelectPrompt(prompt.content, prompt.id);
    setOpen(false);
  };

  const handleEdit = (prompt: SavedPrompt) => {
    setCurrentPrompt(prompt);
    setFormData({
      title: prompt.title,
      content: prompt.content,
      category: prompt.category || "",
    });
    setEditDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu onOpenChange={setOpen} open={open}>
        <DropdownMenuTrigger asChild>
          <Button
            className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
            data-testid="saved-prompts-button"
            variant="ghost"
          >
            <BookmarkIcon size={14} style={{ width: 14, height: 14 }} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel className="flex items-center justify-between">
            Saved Prompts
            <Button
              onClick={() => setCreateDialogOpen(true)}
              size="sm"
              variant="ghost"
            >
              <PlusIcon className="size-4" />
            </Button>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : prompts.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No saved prompts yet
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {prompts.map((prompt) => (
                <DropdownMenuItem
                  asChild
                  className="flex cursor-pointer flex-col items-start gap-1 p-3"
                  key={prompt.id}
                >
                  <div>
                    <div
                      className="w-full"
                      onClick={() => handleSelectPrompt(prompt)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSelectPrompt(prompt);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{prompt.title}</span>
                        <div className="flex items-center gap-1">
                          <Button
                            className="size-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(prompt);
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            <Edit2Icon className="size-3" />
                          </Button>
                          <Button
                            className="size-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(prompt.id);
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            <TrashIcon className="size-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {prompt.content}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        {prompt.category && (
                          <span className="text-xs text-muted-foreground">
                            {prompt.category}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          ~{TokenCounter.countTextTokens(prompt.content)} tokens
                        </span>
                      </div>
                    </div>
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Dialog */}
      <Dialog onOpenChange={setCreateDialogOpen} open={createDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save New Prompt</DialogTitle>
            <DialogDescription>
              Save this prompt for quick access later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g., Write a blog post"
                value={formData.title}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="content">Prompt Content</Label>
                <span className="text-xs text-muted-foreground">
                  ~{formTokenCount} tokens
                </span>
              </div>
              <Textarea
                className="min-h-32"
                id="content"
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                placeholder="Enter the prompt text..."
                value={formData.content}
              />
            </div>
            <div>
              <Label htmlFor="category">Category (optional)</Label>
              <Input
                id="category"
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="e.g., Writing, Code, Creative"
                value={formData.category}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreate}>Save Prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog onOpenChange={setEditDialogOpen} open={editDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Prompt</DialogTitle>
            <DialogDescription>Update your saved prompt</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g., Write a blog post"
                value={formData.title}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-content">Prompt Content</Label>
                <span className="text-xs text-muted-foreground">
                  ~{formTokenCount} tokens
                </span>
              </div>
              <Textarea
                className="min-h-32"
                id="edit-content"
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                placeholder="Enter the prompt text..."
                value={formData.content}
              />
            </div>
            <div>
              <Label htmlFor="edit-category">Category (optional)</Label>
              <Input
                id="edit-category"
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                placeholder="e.g., Writing, Code, Creative"
                value={formData.category}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleUpdate}>Update Prompt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

