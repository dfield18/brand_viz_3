"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";

interface FreeRunResponse {
  hasData: boolean;
  status?: "queued" | "running" | "done" | "error";
  message?: string;
  error?: string;
  /** Phase 2 will populate these */
  results?: unknown;
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

export function FreeDashboard({ showSignupCta, promptCount, models, exampleBrands }: Props) {
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FreeRunResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const modelList = joinWithAnd(models.map((m) => MODEL_LABELS[m] ?? m));
  const canSubmit = brandName.trim().length > 0 && !loading;

  async function runAnalysis(name: string) {
    if (!name || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/free-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: name }),
      });
      const json: FreeRunResponse = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
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
        <div className="flex items-baseline gap-4">
          <div
            className="relative flex-1 min-w-0 cursor-text text-4xl sm:text-5xl font-semibold tracking-tight leading-tight"
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
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
          </button>
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          {promptCount} questions across {modelList}.
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Running analysis for {brandName.trim()}…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          <h2 className="text-base font-semibold text-foreground mb-2">Result</h2>
          {result.message ? (
            <p className="text-sm text-muted-foreground leading-relaxed">{result.message}</p>
          ) : (
            <pre className="text-xs text-muted-foreground overflow-x-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}

      {showSignupCta && (result || error) && (
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
