"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RunPromptsPanel } from "@/components/RunPromptsPanel";
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Pencil,
  Trash2,
  Plus,
  RotateCcw,
  CircleDot,
  Circle,
} from "lucide-react";

interface PromptRow {
  id: string;
  text: string;
  cluster: string;
  intent: string;
  source: "suggested" | "custom";
  enabled: boolean;
  originalText: string | null;
}

interface PromptManagerProps {
  brandSlug: string;
  model: string;
  range: number;
}

const CLUSTER_OPTIONS = ["direct", "related", "comparative", "network", "industry"];
const INTENT_OPTIONS = ["informational", "high-intent"];

export function PromptManager({ brandSlug, model, range }: PromptManagerProps) {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCluster, setNewCluster] = useState("direct");
  const [newIntent, setNewIntent] = useState("informational");
  const [saving, setSaving] = useState(false);

  const fetchPrompts = useCallback(async () => {
    try {
      const res = await fetch(`/api/prompts?brandSlug=${encodeURIComponent(brandSlug)}`);
      if (!res.ok) return;
      const data = await res.json();
      setPrompts(data.prompts);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [brandSlug]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const enabledCount = prompts.filter((p) => p.enabled).length;

  async function handleToggle(id: string, currentEnabled: boolean) {
    // Optimistic update
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !currentEnabled } : p)),
    );
    const res = await fetch(`/api/prompts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !currentEnabled }),
    });
    if (!res.ok) {
      // Revert
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, enabled: currentEnabled } : p)),
      );
    }
  }

  async function handleSaveEdit(id: string) {
    if (!editText.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/prompts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: editText.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? data.prompt : p)),
      );
      setEditingId(null);
    }
    setSaving(false);
  }

  async function handleReset(id: string) {
    setSaving(true);
    const res = await fetch(`/api/prompts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? data.prompt : p)),
      );
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this custom prompt?")) return;
    const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPrompts((prev) => prev.filter((p) => p.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to delete prompt");
    }
  }

  async function handleAddPrompt() {
    if (!newText.trim()) return;
    setSaving(true);
    const res = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandSlug,
        text: newText.trim(),
        cluster: newCluster,
        intent: newIntent,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setPrompts((prev) => [...prev, data.prompt]);
      setNewText("");
      setShowAddForm(false);
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Failed to add prompt");
    }
    setSaving(false);
  }

  const suggested = prompts.filter((p) => p.source === "suggested");
  const custom = prompts.filter((p) => p.source === "custom");

  return (
    <div className="space-y-4">
      {/* Prompt Management */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-section">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">Prompts</h2>
            {!loading && (
              <span className="text-xs text-muted-foreground">
                {enabledCount} enabled
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="gap-1 text-xs"
          >
            {expanded ? (
              <>
                Hide <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Manage <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>

        {expanded && !loading && (
          <div className="mt-4 space-y-5">
            {/* Suggested prompts */}
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase mb-2">
                Suggested
              </p>
              <div className="space-y-2">
                {suggested.map((p) => (
                  <PromptRow
                    key={p.id}
                    prompt={p}
                    isEditing={editingId === p.id}
                    editText={editText}
                    saving={saving}
                    onToggle={() => handleToggle(p.id, p.enabled)}
                    onStartEdit={() => {
                      setEditingId(p.id);
                      setEditText(p.text);
                    }}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => handleSaveEdit(p.id)}
                    onEditTextChange={setEditText}
                    onReset={
                      p.originalText && p.text !== p.originalText
                        ? () => handleReset(p.id)
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Custom prompts */}
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase mb-2">
                Custom
              </p>
              {custom.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No custom prompts yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {custom.map((p) => (
                    <PromptRow
                      key={p.id}
                      prompt={p}
                      isEditing={editingId === p.id}
                      editText={editText}
                      saving={saving}
                      onToggle={() => handleToggle(p.id, p.enabled)}
                      onStartEdit={() => {
                        setEditingId(p.id);
                        setEditText(p.text);
                      }}
                      onCancelEdit={() => setEditingId(null)}
                      onSaveEdit={() => handleSaveEdit(p.id)}
                      onEditTextChange={setEditText}
                      onDelete={() => handleDelete(p.id)}
                    />
                  ))}
                </div>
              )}

              {/* Add custom prompt */}
              {!showAddForm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-1.5 text-xs"
                  onClick={() => setShowAddForm(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Custom Prompt
                </Button>
              ) : (
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                  <Input
                    placeholder="Enter prompt text (must include {brand})"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    className="text-sm"
                  />
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground">Cluster:</label>
                      <select
                        value={newCluster}
                        onChange={(e) => setNewCluster(e.target.value)}
                        className="text-xs rounded border border-border bg-background px-2 py-1"
                      >
                        {CLUSTER_OPTIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs text-muted-foreground">Intent:</label>
                      <select
                        value={newIntent}
                        onChange={(e) => setNewIntent(e.target.value)}
                        className="text-xs rounded border border-border bg-background px-2 py-1"
                      >
                        {INTENT_OPTIONS.map((i) => (
                          <option key={i} value={i}>{i}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddPrompt}
                      disabled={saving || !newText.trim()}
                      className="text-xs"
                    >
                      Add Prompt
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowAddForm(false);
                        setNewText("");
                      }}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Existing RunPromptsPanel */}
      <RunPromptsPanel brandSlug={brandSlug} model={model} range={range} />
    </div>
  );
}

function PromptRow({
  prompt,
  isEditing,
  editText,
  saving,
  onToggle,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditTextChange,
  onReset,
  onDelete,
}: {
  prompt: PromptRow;
  isEditing: boolean;
  editText: string;
  saving: boolean;
  onToggle: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditTextChange: (text: string) => void;
  onReset?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        title={prompt.enabled ? "Disable" : "Enable"}
      >
        {prompt.enabled ? (
          <CircleDot className="h-4 w-4 text-primary" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </button>

      {/* Text or edit input */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <Input
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              className="text-xs h-7"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={onSaveEdit}
              disabled={saving}
              className="h-7 w-7 p-0"
            >
              <Check className="h-3.5 w-3.5 text-emerald-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelEdit}
              className="h-7 w-7 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <p
            className={`text-xs truncate ${
              prompt.enabled ? "text-foreground" : "text-muted-foreground line-through"
            }`}
          >
            {prompt.text}
          </p>
        )}
      </div>

      {/* Badges */}
      {!isEditing && (
        <>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {prompt.cluster}
          </Badge>

          {/* Actions */}
          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onStartEdit}
              className="h-7 w-7 p-0"
              title="Edit"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            {onReset && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                disabled={saving}
                className="h-7 w-7 p-0"
                title="Reset to original"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
