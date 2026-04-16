"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTIVE_MODELS = ["chatgpt", "gemini", "claude", "perplexity", "google"];

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google: "Google AI Overview",
};

interface AnalyzeRunnerProps {
  brandSlug: string;
  model: string;
  range: number;
  onDone: (slug: string, execModel: string) => void;
}

interface ModelStatus {
  completed: number;
  total: number;
  status: "waiting" | "running" | "done" | "error";
}

interface BackfillProgress {
  completed: number;
  total: number;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

const STORAGE_KEY = (slug: string) => `analysis:lastJobId:${slug}`;

export function AnalyzeRunner({ brandSlug, model, range, onDone }: AnalyzeRunnerProps) {
  const [status, setStatus] = useState<"starting" | "running" | "done" | "error">("starting");
  const [phase, setPhase] = useState<"analysis" | "backfill">("analysis");
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modelStatuses, setModelStatuses] = useState<Record<string, ModelStatus>>({});
  const [backfillProgress, setBackfillProgress] = useState<Record<string, BackfillProgress>>({});
  const [elapsed, setElapsed] = useState(0);
  const generationRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onDoneRef = useRef(onDone);
  const startTimeRef = useRef(Date.now());
  onDoneRef.current = onDone;

  const modelsToRun = model === "all" ? ACTIVE_MODELS : [model];

  // Dedicated elapsed timer — runs whenever status is "starting" or "running"
  useEffect(() => {
    if (status !== "starting" && status !== "running") return;
    const id = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 500);
    return () => clearInterval(id);
  }, [status]);

  /** Process a single model's job to completion. Returns when done. */
  async function runSingleModel(
    execModel: string,
    signal: AbortSignal,
    isStale: () => boolean,
    onProgress: (completed: number, total: number) => void,
    onStatusChange: (status: ModelStatus["status"]) => void,
  ) {
    onStatusChange("running");

    // 1) Create job
    const createRes = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandSlug, model: execModel, range }),
      signal,
    });
    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create job (${createRes.status})`);
    }
    const { jobId } = await createRes.json();
    localStorage.setItem(STORAGE_KEY(brandSlug), jobId);

    if (isStale()) return;

    // 2) Process loop
    let done = false;
    while (!done && !isStale()) {
      await sleep(200);
      if (isStale()) return;

      const procRes = await fetch(`/api/jobs/${jobId}/process`, { method: "POST", signal });
      if (!procRes.ok) {
        const err = await procRes.json().catch(() => ({}));
        throw new Error(err.error || `Process failed (${procRes.status})`);
      }
      const prog = await procRes.json();
      if (isStale()) return;

      onProgress(prog.completedPrompts, prog.totalPrompts);

      if (prog.status === "done") {
        done = true;
        onStatusChange("done");
      } else if (prog.status === "error") {
        onStatusChange("error");
        throw new Error(prog.error ?? "Unknown error");
      }
    }
  }

  /** Backfill a single model's historical weekly data. Polls until done. */
  async function runBackfillForModel(
    execModel: string,
    signal: AbortSignal,
    isStale: () => boolean,
  ) {
    let done = false;
    while (!done && !isStale()) {
      const res = await fetch("/api/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug, model: execModel, range }),
        signal,
      });
      if (!res.ok) {
        // Best-effort — don't throw, just stop
        break;
      }
      const data = await res.json();
      if (isStale()) return;

      setBackfillProgress((prev) => ({
        ...prev,
        [execModel]: { completed: data.completedWeeks, total: data.totalWeeks },
      }));

      if (data.status === "done") {
        done = true;
      }
    }
  }

  const runJob = useCallback(async () => {
    const gen = ++generationRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;
    setStatus("starting");
    setPhase("analysis");
    setCompleted(0);
    setTotal(0);
    setError(null);
    setBackfillProgress({});
    startTimeRef.current = Date.now();
    setElapsed(0);

    // Initialize per-model statuses
    const initStatuses: Record<string, ModelStatus> = {};
    for (const m of modelsToRun) {
      initStatuses[m] = { completed: 0, total: 0, status: "waiting" };
    }
    setModelStatuses(initStatuses);

    const isStale = () => gen !== generationRef.current;

    try {
      setStatus("running");

      // Phase 1: Main analysis
      if (modelsToRun.length === 1) {
        const execModel = modelsToRun[0];
        await runSingleModel(execModel, signal, isStale, (c, t) => {
          setCompleted(c);
          setTotal(t);
          setModelStatuses((prev) => ({ ...prev, [execModel]: { ...prev[execModel], completed: c, total: t } }));
        }, (s) => {
          setModelStatuses((prev) => ({ ...prev, [execModel]: { ...prev[execModel], status: s } }));
        });
      } else {
        // Multiple models — run in parallel
        const progressMap = new Map<string, { completed: number; total: number }>();
        for (const m of modelsToRun) {
          progressMap.set(m, { completed: 0, total: 0 });
        }

        const updateAggregateProgress = () => {
          let aggCompleted = 0;
          let aggTotal = 0;
          for (const p of progressMap.values()) {
            aggCompleted += p.completed;
            aggTotal += p.total;
          }
          setCompleted(aggCompleted);
          setTotal(aggTotal);
        };

        // Use allSettled so one model failing doesn't block the others or Phase 2
        const settled = await Promise.allSettled(
          modelsToRun.map((execModel) =>
            runSingleModel(execModel, signal, isStale, (c, t) => {
              progressMap.set(execModel, { completed: c, total: t });
              updateAggregateProgress();
              setModelStatuses((prev) => ({ ...prev, [execModel]: { ...prev[execModel], completed: c, total: t } }));
            }, (s) => {
              setModelStatuses((prev) => ({ ...prev, [execModel]: { ...prev[execModel], status: s } }));
            }),
          ),
        );

        // Track which models succeeded for backfill
        const failedModels = new Set<string>();
        for (let i = 0; i < settled.length; i++) {
          if (settled[i].status === "rejected") {
            failedModels.add(modelsToRun[i]);
            setModelStatuses((prev) => ({ ...prev, [modelsToRun[i]]: { ...prev[modelsToRun[i]], status: "error" } }));
          }
        }

        // If ALL models failed, throw to trigger error state
        if (failedModels.size === modelsToRun.length) {
          const firstErr = settled.find((s) => s.status === "rejected") as PromiseRejectedResult;
          throw firstErr.reason;
        }
      }

      if (isStale()) return;

      // Phase 2: Backfill historical weekly data (best-effort, skip failed models)
      setPhase("backfill");
      try {
        await Promise.allSettled(
          modelsToRun.map((m) => runBackfillForModel(m, signal, isStale)),
        );
      } catch {
        // Backfill failure doesn't block completion
      }

      // All done
      if (!isStale()) {
        setElapsed(Date.now() - startTimeRef.current);
        setStatus("done");
        await sleep(600);
        if (!isStale()) {
          onDoneRef.current(brandSlug, modelsToRun.length > 1 ? "all" : modelsToRun[0]);
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (!isStale()) {
        setElapsed(Date.now() - startTimeRef.current);
        setError(e instanceof Error ? e.message : "Unknown error");
        setStatus("error");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandSlug, modelsToRun, range]);

  // Start on mount; bump generation on cleanup to invalidate stale runs
  useEffect(() => {
    runJob();
    return () => {
      // generationRef is a mutation counter, not a DOM ref — intentionally read at cleanup time
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generationRef.current++;
      abortControllerRef.current?.abort();
    };
  }, [runJob]);

  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isActive = status === "starting" || status === "running";

  // Aggregate backfill progress
  const bfEntries = Object.values(backfillProgress);
  const bfCompleted = bfEntries.reduce((s, e) => s + e.completed, 0);
  const bfTotal = bfEntries.reduce((s, e) => s + e.total, 0);
  const bfPct = bfTotal > 0 ? Math.round((bfCompleted / bfTotal) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {status === "starting" && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Creating jobs...</span>
            </>
          )}
          {status === "running" && phase === "analysis" && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span>Analyzing {brandSlug}...</span>
            </>
          )}
          {status === "running" && phase === "backfill" && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span>Building trend history...</span>
            </>
          )}
          {status === "done" && (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-emerald-700">Analysis complete</span>
            </>
          )}
          {status === "error" && (
            <>
              <AlertCircle className="h-4 w-4 text-red-500" />
              <span className="text-red-700">Analysis failed</span>
            </>
          )}
        </div>
        {(isActive || status === "done") && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatElapsed(elapsed)}
          </span>
        )}
      </div>

      {/* Overall progress bar (analysis phase) */}
      {(isActive || status === "done") && phase === "analysis" && total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{completed} / {total} prompts</span>
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

      {/* Per-model progress rows (analysis phase) */}
      {(isActive || status === "done") && phase === "analysis" && modelsToRun.length > 0 && (
        <div className="space-y-2">
          {modelsToRun.map((m) => {
            const ms = modelStatuses[m];
            if (!ms) return null;
            const modelPct = ms.total > 0 ? Math.round((ms.completed / ms.total) * 100) : 0;
            const label = MODEL_LABELS[m] ?? m;
            return (
              <div key={m} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 w-24 shrink-0">
                  {ms.status === "waiting" && (
                    <span className="h-3 w-3 rounded-full border border-muted-foreground/30" />
                  )}
                  {ms.status === "running" && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  )}
                  {ms.status === "done" && (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  )}
                  {ms.status === "error" && (
                    <AlertCircle className="h-3 w-3 text-red-500" />
                  )}
                  <span className="text-xs font-medium">{label}</span>
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      ms.status === "done" ? "bg-emerald-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${modelPct}%` }}
                  />
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground w-16 text-right">
                  {ms.total > 0 ? `${ms.completed}/${ms.total}` : ms.status === "waiting" ? "—" : "..."}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Backfill progress (backfill phase) */}
      {status === "running" && phase === "backfill" && bfTotal > 0 && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{bfCompleted} / {bfTotal} total across models</span>
              <span>{bfPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-chart-2 transition-all duration-300"
                style={{ width: `${bfPct}%` }}
              />
            </div>
          </div>
          {modelsToRun.map((m) => {
            const bp = backfillProgress[m];
            if (!bp) return null;
            const mPct = bp.total > 0 ? Math.round((bp.completed / bp.total) * 100) : 0;
            const label = MODEL_LABELS[m] ?? m;
            return (
              <div key={m} className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 w-24 shrink-0">
                  {bp.completed >= bp.total ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  )}
                  <span className="text-xs font-medium">{label}</span>
                </div>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      bp.completed >= bp.total ? "bg-emerald-500" : "bg-chart-2"
                    }`}
                    style={{ width: `${mPct}%` }}
                  />
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground w-16 text-right">
                  {bp.completed}/{bp.total} months
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Error + retry */}
      {status === "error" && error && (
        <div className="space-y-3">
          <p className="text-xs text-red-600">{error}</p>
          <Button size="sm" variant="outline" onClick={runJob}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
