"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Check,
  X,
  Pencil,
  Trash2,
  Plus,
  RotateCcw,
  CircleDot,
  Circle,
  Loader2,
  ChevronRight,
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

interface PromptEditorProps {
  brandSlug: string;
  brandName: string;
  entityType?: "company" | "cause";
  onStartAnalysis: () => void;
}

const CLUSTER_LABELS: Record<string, string> = {
  brand: "Brand",
  industry: "Industry",
};

const CLUSTER_OPTIONS = ["brand", "industry"];
const INTENT_OPTIONS = ["informational", "high-intent"];

export function PromptEditor({ brandSlug, brandName, entityType, onStartAnalysis }: PromptEditorProps) {
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCluster, setNewCluster] = useState("brand");
  const [newIntent, setNewIntent] = useState("informational");
  const [saving, setSaving] = useState(false);
  const [showSuggested, setShowSuggested] = useState(false);
  const [industry, setIndustry] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const fetchPrompts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ brandSlug });
      if (entityType) params.set("category", entityType === "cause" ? "political_advocacy" : "commercial");
      const res = await fetch(`/api/prompts?${params.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      setPrompts(data.prompts);
      if (data.industry) setIndustry(data.industry);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [brandSlug, entityType]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const enabledCount = prompts.filter((p) => p.enabled).length;
  const suggested = prompts.filter((p) => p.source !== "custom");
  const custom = prompts.filter((p) => p.source === "custom");

  async function handleToggle(id: string, currentEnabled: boolean) {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, enabled: !currentEnabled } : p)),
    );
    const res = await fetch(`/api/prompts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !currentEnabled }),
    });
    if (!res.ok) {
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
      setPrompts((prev) => prev.map((p) => (p.id === id ? data.prompt : p)));
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
      setPrompts((prev) => prev.map((p) => (p.id === id ? data.prompt : p)));
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPrompts((prev) => prev.filter((p) => p.id !== id));
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
    }
    setSaving(false);
  }

  async function handleRegenerate() {
    if (!confirm("This will replace all auto-generated prompts with fresh ones. Your custom prompts will be kept. Continue?")) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/prompts/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrompts(data.prompts);
      }
    } catch {
      // silently fail
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading prompts for {brandName}...</p>
      </div>
    );
  }

  // Group suggested by cluster
  const clusterGroups = CLUSTER_OPTIONS
    .map((cluster) => ({
      cluster,
      label: CLUSTER_LABELS[cluster] ?? cluster,
      prompts: suggested.filter((p) => p.cluster === cluster),
    }))
    .filter((g) => g.prompts.length > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">
          These are the questions AI platforms will be asked about{" "}
          <span className="font-medium text-foreground">{brandName}</span>.
          You can edit, toggle, or add your own before starting the analysis.
        </p>
      </div>

      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{enabledCount}</span> of{" "}
          {prompts.length} prompts enabled
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            {regenerating ? "Regenerating..." : "Regenerate Prompts"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3 w-3" />
            Add Custom
          </Button>
        </div>
      </div>

      {/* Add custom prompt form */}
      {showAddForm && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2.5">
          <p className="text-xs font-medium">Add a Custom Prompt</p>
          <Input
            placeholder={`e.g. What are the best alternatives to ${brandName}?`}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className="text-sm"
            autoFocus
          />
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground">Type:</label>
              <select
                value={newCluster}
                onChange={(e) => setNewCluster(e.target.value)}
                className="text-xs rounded border border-border bg-background px-2 py-1"
              >
                {CLUSTER_OPTIONS.map((c) => (
                  <option key={c} value={c}>{CLUSTER_LABELS[c] ?? c}</option>
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
            <Button size="sm" onClick={handleAddPrompt} disabled={saving || !newText.trim()} className="text-xs">
              Add
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowAddForm(false); setNewText(""); }} className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Custom prompts (show first, more prominent) */}
      {custom.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Custom Prompts
          </p>
          <div className="space-y-1.5">
            {custom.map((p) => (
              <PromptItem
                key={p.id}
                prompt={p}
                brandName={brandName}
                industry={industry}
                isEditing={editingId === p.id}
                editText={editText}
                saving={saving}
                onToggle={() => handleToggle(p.id, p.enabled)}
                onStartEdit={() => { setEditingId(p.id); setEditText(p.text); }}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => handleSaveEdit(p.id)}
                onEditTextChange={setEditText}
                onDelete={() => handleDelete(p.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Suggested prompts — collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setShowSuggested((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showSuggested ? "rotate-90" : ""}`} />
          Suggested Prompts ({suggested.length})
        </button>
        {showSuggested && (
          <div className="space-y-3">
            {clusterGroups.map((group) => {
              const allEnabled = group.prompts.every((p) => p.enabled);
              const toggleAll = async () => {
                const newEnabled = !allEnabled;
                for (const p of group.prompts) {
                  if (p.enabled !== newEnabled) {
                    await handleToggle(p.id, p.enabled);
                  }
                }
              };
              return (
              <div key={group.cluster}>
                <div className="flex items-center justify-between mb-1.5 ml-1">
                  <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                    {group.label}
                  </p>
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    {allEnabled ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="space-y-1">
                  {group.prompts.map((p) => (
                    <PromptItem
                      key={p.id}
                      prompt={p}
                      brandName={brandName}
                      industry={industry}
                      isEditing={editingId === p.id}
                      editText={editText}
                      saving={saving}
                      onToggle={() => handleToggle(p.id, p.enabled)}
                      onStartEdit={() => { setEditingId(p.id); setEditText(p.text); }}
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
              );
            })}
          </div>
        )}
      </div>

      {/* Start Analysis button */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {enabledCount} prompt{enabledCount !== 1 ? "s" : ""} will be sent to each AI platform
        </p>
        <Button onClick={onStartAnalysis} disabled={enabledCount === 0}>
          Start Analysis
        </Button>
      </div>
    </div>
  );
}

/* ─── Prompt Item ──────────────────────────────────────────────────── */

function PromptItem({
  prompt,
  brandName,
  industry,
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
  brandName: string;
  industry: string | null;
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
  // Replace placeholders for display
  // Use the industry label if available, otherwise show "the industry" (not the brand name)
  const industryLabel = industry && industry.toLowerCase() !== brandName.toLowerCase()
    ? industry
    : null;
  let displayText = prompt.text
    .replace(/\{brand\}/g, brandName)
    .replace(/\{industry\}/gi, industryLabel ? `the ${industryLabel} industry` : "the industry")
    .replace(/\{competitor\}/g, "competitor");
  // Also replace literal "the industry" with actual industry name
  if (industryLabel) {
    displayText = displayText.replace(/\bthe industry\b/gi, `the ${industryLabel} industry`);
  }

  return (
    <div className={`group flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors ${prompt.enabled ? "bg-muted/30" : "bg-transparent opacity-60"}`}>
      {/* Toggle */}
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        {prompt.enabled ? (
          <CircleDot className="h-3.5 w-3.5 text-primary" />
        ) : (
          <Circle className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              className="text-xs h-7"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
            />
            <button type="button" onClick={onSaveEdit} disabled={saving} className="shrink-0 text-emerald-600 hover:text-emerald-700">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={onCancelEdit} className="shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <p className={`text-xs leading-snug ${prompt.enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>
            {displayText}
          </p>
        )}
      </div>

      {/* Actions */}
      {!isEditing && (
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={onStartEdit} className="p-1 text-muted-foreground hover:text-foreground" title="Edit">
            <Pencil className="h-3 w-3" />
          </button>
          {onReset && (
            <button type="button" onClick={onReset} disabled={saving} className="p-1 text-muted-foreground hover:text-foreground" title="Reset">
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} className="p-1 text-red-400 hover:text-red-600" title="Delete">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
