"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

interface FreeExecuteResponse {
  hasData?: boolean;
  brandSlug?: string;
  error?: string;
}

interface Props {
  showSignupCta: boolean;
  promptCount: number;
  models: string[];
  exampleBrands: string[];
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

/** Rotating loading copy that roughly tracks the real server phases
 *  (classify → generate → LLM calls → analysis/sources → finalize).
 *  Server doesn't stream progress — this is a clock, but each message
 *  reflects something that's actually happening around that mark. */
function buildLoadingMessages(brandName: string, promptCount: number, modelList: string): { atMs: number; text: string }[] {
  return [
    { atMs: 0, text: `Running analysis for ${brandName}… this can take 30–60 seconds.` },
    { atMs: 8_000, text: `Picking the ${promptCount} prompts real people ask AI about ${brandName}…` },
    { atMs: 18_000, text: `Sending them to ${modelList} — today plus the last two months…` },
    { atMs: 35_000, text: "Reading responses and pulling out sources…" },
    { atMs: 55_000, text: "Building your report…" },
  ];
}

export function FreeDashboard({ showSignupCta, promptCount, models, exampleBrands }: Props) {
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-fire when the URL carries ?brand=<name>&run=1 — used by the
  // entity-page dropdown's "Try another" items to bounce anon users
  // back here with the requested brand pre-running. Reads from
  // window.location in a useEffect so we don't deopt the tree to
  // client rendering via useSearchParams.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const brand = params.get("brand");
    if (!brand || params.get("run") !== "1") return;
    setBrandName(brand);
    runAnalysis(brand);
    // Clear the query params so a refresh doesn't re-fire the run.
    window.history.replaceState(null, "", window.location.pathname);
    // Intentionally only runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modelList = joinWithAnd(models.map((m) => MODEL_LABELS[m] ?? m));
  const canSubmit = brandName.trim().length > 0 && !loading;

  // Rotate loading copy on a timer while the POST is in flight. Each message
  // has an `atMs` offset from when loading started; a setTimeout at that
  // offset advances the index. All timers are cleared when loading flips off.
  const loadingMessages = buildLoadingMessages(brandName.trim(), promptCount, modelList);
  useEffect(() => {
    if (!loading) {
      setLoadingMessageIndex(0);
      return;
    }
    const timers = loadingMessages.slice(1).map((msg, i) =>
      setTimeout(() => setLoadingMessageIndex(i + 1), msg.atMs),
    );
    return () => timers.forEach(clearTimeout);
    // Timers key off `loading` only — we don't want to restart the sequence
    // every render when the brandName prop inside loadingMessages changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /** Kick off the full free-tier pipeline in a single POST and redirect to
   *  the overview on success. The server runs classify + generate + execute
   *  end-to-end, so there's no preview step and no client-side chaining. */
  async function runAnalysis(name: string) {
    if (!name || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/free-run/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: name }),
      });
      const json: FreeExecuteResponse = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      if (!json.brandSlug) {
        throw new Error("Analysis finished but no brand URL was returned.");
      }
      // Hard navigate so the overview loads fresh (new auth context, cache,
      // and scroll position) instead of a SPA transition that can get stuck
      // mid-refresh on anonymous-to-entity handoff.
      window.location.assign(`/entity/${json.brandSlug}/overview`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = brandName.trim();
    if (name) runAnalysis(name);
  }

  function handleExample(name: string) {
    setBrandName(name);
    runAnalysis(name);
  }

  return (
    <div className="space-y-10">
      <form onSubmit={handleSubmit}>
        {/* Small free-tier badge sits just above the input */}
        <div className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          <span>Free · No sign-up</span>
        </div>

        <label htmlFor="freeBrandInput" className="sr-only">
          Brand name
        </label>
        <div className="flex items-baseline gap-3 sm:gap-4">
          <div
            className="relative flex-1 min-w-0 cursor-text text-3xl sm:text-5xl font-semibold tracking-tight leading-tight"
            onClick={() => inputRef.current?.focus()}
          >
            <input
              id="freeBrandInput"
              ref={inputRef}
              type="text"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              maxLength={80}
              disabled={loading}
              aria-label="Brand name"
              className="absolute inset-0 w-full h-full opacity-0 cursor-text disabled:cursor-not-allowed"
            />
            <span className="inline-flex items-baseline">
              {brandName ? (
                <>
                  <span className="text-foreground whitespace-pre">{brandName}</span>
                  <span
                    aria-hidden="true"
                    className="ml-1 inline-block w-[3px] h-[0.9em] bg-foreground align-[-0.1em] cursor-blink"
                  />
                </>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block w-[3px] h-[0.9em] bg-foreground align-[-0.1em] cursor-blink"
                  />
                  <span className="text-muted-foreground/50 font-normal">Type in brand name</span>
                </>
              )}
            </span>
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            aria-label="Run free analysis"
            className="shrink-0 self-center inline-flex items-center justify-center size-11 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Free to use — no credit card, no email, no account needed.
        </p>

        {exampleBrands.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Try:</span>
            {exampleBrands.map((brand) => (
              <button
                key={brand}
                type="button"
                onClick={() => handleExample(brand)}
                disabled={loading}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground hover:border-foreground/40 hover:bg-muted/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {brand}
              </button>
            ))}
          </div>
        )}
      </form>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-foreground shrink-0" />
          <span>{loadingMessages[loadingMessageIndex]?.text ?? loadingMessages[0].text}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {showSignupCta && error && (
        <div className="rounded-xl border border-border/60 bg-card/60 p-6 text-center">
          <p className="text-sm font-medium text-foreground mb-1">Want the full report?</p>
          <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto leading-relaxed">
            Sign up to track all 5 AI platforms, run unlimited analyses, save historical trends, and get email reports.
          </p>
          <Link
            href="/sign-up"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
          >
            Sign up free
          </Link>
        </div>
      )}
    </div>
  );
}
