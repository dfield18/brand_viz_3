"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  brandName: string;
  promptCount: number;
  models: string[];
  /** Called if the dialog closes (escape key, outside click) before the
   *  run finishes OR when the user dismisses an error. Parent should
   *  reset state so the overlay unmounts. */
  onCancel: () => void;
}

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google: "Google AI Overviews",
};

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildMessages(brandName: string, promptCount: number, modelList: string) {
  return [
    { atMs: 0, text: `Running analysis for ${brandName}… this can take 30–60 seconds.` },
    { atMs: 8_000, text: `Picking the ${promptCount} prompts real people ask AI about ${brandName}…` },
    { atMs: 18_000, text: `Sending them to ${modelList} — today plus the last two months…` },
    { atMs: 35_000, text: "Reading responses and pulling out sources…" },
    { atMs: 55_000, text: "Building your report…" },
  ];
}

/**
 * Modal overlay that fires a free-tier run for a given brand name and
 * redirects to the resulting entity page on success. Used by the brand
 * selector on entity pages so anon visitors can switch brands without
 * bouncing back to the homepage.
 *
 * The overlay mounts as soon as the parent sets a brandName. It POSTs
 * to /api/free-run/execute in a single useEffect, cycles the loading
 * copy on timers identical to FreeDashboard, and hard-navigates to the
 * returned brand slug on success (window.location.assign — matches the
 * homepage redirect semantics and ensures the new entity page loads
 * with a fresh auth context). Aborts the in-flight POST if the user
 * closes the dialog.
 */
export function FreeRunOverlay({ brandName, promptCount, models, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [msgIndex, setMsgIndex] = useState(0);

  const modelList = joinWithAnd(models.map((m) => MODEL_LABELS[m] ?? m));
  const messages = buildMessages(brandName, promptCount, modelList);

  useEffect(() => {
    const controller = new AbortController();
    async function run() {
      try {
        const res = await fetch("/api/free-run/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandName }),
          signal: controller.signal,
        });
        const json = await res.json();
        if (controller.signal.aborted) return;
        if (!res.ok) {
          throw new Error(json.error || `Request failed (${res.status})`);
        }
        if (!json.brandSlug) {
          throw new Error("Analysis finished but no brand URL was returned.");
        }
        // Hard navigate so the new overview page loads fresh (cache,
        // scroll, auth context) instead of a SPA transition that can
        // get stuck on the prior entity's layout.
        window.location.assign(`/entity/${json.brandSlug}/overview`);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    }
    run();
    return () => controller.abort();
  }, [brandName]);

  useEffect(() => {
    const timers = messages.slice(1).map((msg, i) =>
      setTimeout(() => setMsgIndex(i + 1), msg.atMs),
    );
    return () => timers.forEach(clearTimeout);
    // Messages array is recomputed each render; we only want to restart
    // the timer sequence when brandName changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandName]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!!error}>
        <DialogHeader>
          <DialogTitle>
            {error ? "Something went wrong" : `Analyzing ${brandName}`}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : (
          <div className="mt-2 flex items-start gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-foreground" />
            <span>{messages[msgIndex]?.text ?? messages[0].text}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
