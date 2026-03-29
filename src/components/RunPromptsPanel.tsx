"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Play, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { clearFetchCache } from "@/lib/useCachedFetch";

const ACTIVE_MODELS = ["chatgpt", "gemini", "claude", "perplexity", "google"];

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google: "Google AI Overview",
};

interface RunPreview {
  id: string;
  createdAt: string;
  promptText: string;
  rawSnippet: string;
}

interface RunPromptsPanelProps {
  brandSlug: string;
  model: string;
  range: number;
}

export function RunPromptsPanel({ brandSlug, model, range }: RunPromptsPanelProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [modelProgress, setModelProgress] = useState("");
  const [runsPreview, setRunsPreview] = useState<RunPreview[]>([]);
  const [showRuns, setShowRuns] = useState(false);
  const abortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const modelsToRun = model === "all" ? ACTIVE_MODELS : [model];

  // Abort processing loop and in-flight requests on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      abortControllerRef.current?.abort();
    };
  }, []);

  const fetchRuns = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/jobs/${id}/runs?limit=10`);
      if (!res.ok) return;
      const data = await res.json();
      setRunsPreview(
        data.runs.map((r: { id: string; createdAt: string; prompt: { text: string }; rawResponseText: string }) => ({
          id: r.id,
          createdAt: r.createdAt,
          promptText: r.prompt.text,
          rawSnippet: r.rawResponseText.slice(0, 140),
        })),
      );
    } catch {}
  }, []);

  // Poll a single model's backfill until done. Updates the shared progress
  // tracker so parallel models merge their progress into one bar.
  async function pollModel(
    execModel: string,
    signal: AbortSignal,
    progress: Map<string, { completed: number; total: number }>,
    onProgress: () => void,
  ): Promise<string | null> {
    let latestJobId: string | null = null;
    let done = false;

    while (!done && !abortRef.current) {
      const res = await fetch("/api/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug, model: execModel, range }),
        signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Backfill failed for ${MODEL_LABELS[execModel] ?? execModel} (${res.status})`);
      }

      const data = await res.json();
      progress.set(execModel, {
        completed: data.completedWeeks,
        total: data.totalWeeks,
      });
      onProgress();

      if (data.status === "done") {
        done = true;
        latestJobId = data.latestJobId ?? null;
      }
    }

    return latestJobId;
  }

  async function handleRun() {
    if (isRunning) return;
    setError(null);
    setIsRunning(true);
    setRunsPreview([]);
    setShowRuns(false);
    setStatus("running");
    abortRef.current = false;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    // Shared progress tracker — one entry per model
    const progress = new Map<string, { completed: number; total: number }>();
    const syncProgress = () => {
      let sumCompleted = 0;
      let sumTotal = 0;
      for (const v of progress.values()) {
        sumCompleted += v.completed;
        sumTotal += v.total;
      }
      setCompleted(sumCompleted);
      setTotal(sumTotal);

      const labels = modelsToRun.map((m) => {
        const p = progress.get(m);
        if (!p) return MODEL_LABELS[m] ?? m;
        if (p.completed >= p.total) return `${MODEL_LABELS[m] ?? m} ✓`;
        return `${MODEL_LABELS[m] ?? m} ${p.completed}/${p.total}`;
      });
      setModelProgress(labels.join(" · "));
    };

    try {
      // Run all models in parallel — allSettled so one failure doesn't kill the rest
      const settled = await Promise.allSettled(
        modelsToRun.map((m) => pollModel(m, signal, progress, syncProgress)),
      );

      // Collect errors from failed models
      const errors: string[] = [];
      const jobIds: (string | null)[] = [];
      for (const result of settled) {
        if (result.status === "rejected") {
          const e = result.reason;
          if (e instanceof DOMException && e.name === "AbortError") continue;
          errors.push(e instanceof Error ? e.message : "Unknown error");
        } else {
          jobIds.push(result.value);
        }
      }

      // Clear cached tab data so tabs reload with fresh results
      clearFetchCache();

      if (errors.length > 0) {
        setError(errors.join("; "));
        setStatus(jobIds.length > 0 ? "done" : "error");
      } else {
        setStatus("done");
      }

      // Fetch runs preview from last successful model's latest job
      const lastJobId = jobIds.filter(Boolean).pop() ?? null;
      if (!abortRef.current && lastJobId) {
        await fetchRuns(lastJobId);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    } finally {
      setIsRunning(false);
    }
  }

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const statusColor =
    status === "done"
      ? "bg-emerald-100 text-emerald-700"
      : status === "error"
        ? "bg-red-100 text-red-700"
        : status === "running"
          ? "bg-blue-100 text-blue-700"
          : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">Run Prompts</h2>
        {status && (
          <Badge variant="outline" className={statusColor}>
            {status}
          </Badge>
        )}
      </div>

      {/* Config info */}
      <div className="text-xs text-muted-foreground space-y-0.5 mb-3">
        <p>
          Brand: {brandSlug} &middot; Models: {modelsToRun.map(m => MODEL_LABELS[m] ?? m).join(", ")} &middot; Range: {range}d
        </p>
      </div>

      {/* Run button */}
      <Button
        size="sm"
        onClick={handleRun}
        disabled={isRunning}
        className="gap-2"
      >
        {isRunning ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {isRunning ? `Running${modelProgress ? ` — ${modelProgress}` : ""}...` : "Run prompts (90-day trend)"}
      </Button>

      {/* Progress */}
      {status && status !== "queued" && isRunning && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {completed} / {total} weeks
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Runs preview */}
      {status === "done" && runsPreview.length > 0 && (
        <div className="mt-4">
          <Separator className="mb-3" />
          <button
            type="button"
            onClick={() => setShowRuns(!showRuns)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRuns ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            View runs ({runsPreview.length})
          </button>
          {showRuns && (
            <div className="mt-2 space-y-2 max-h-80 overflow-y-auto">
              {runsPreview.map((r) => (
                <div
                  key={r.id}
                  className="rounded border border-border/50 bg-muted/30 p-2.5 text-xs"
                >
                  <p className="font-medium">{r.promptText}</p>
                  <p className="text-muted-foreground mt-1">{r.rawSnippet}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
