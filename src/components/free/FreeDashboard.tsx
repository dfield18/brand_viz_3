"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Pencil, X as XIcon } from "lucide-react";

interface FreePrompt {
  text: string;
  intent: string;
}

interface FreeRunResponse {
  hasData: boolean;
  brandName?: string;
  industry?: string;
  category?: string;
  prompts?: FreePrompt[];
  message?: string;
  error?: string;
}

interface FreeExecuteResponse {
  hasData?: boolean;
  brandSlug?: string;
  message?: string;
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

export function FreeDashboard({ showSignupCta, promptCount, models, exampleBrands }: Props) {
  const router = useRouter();
  const [brandName, setBrandName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FreeRunResponse | null>(null);
  const [editingIndustry, setEditingIndustry] = useState(false);
  const [industryDraft, setIndustryDraft] = useState("");
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [runningReport, setRunningReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportResult, setReportResult] = useState<{ message?: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function startIndustryEdit() {
    if (!result?.industry) return;
    setIndustryDraft(result.industry);
    setEditingIndustry(true);
  }
  function saveIndustry() {
    if (!result) return;
    const trimmed = industryDraft.trim();
    if (!trimmed) return;
    setResult({ ...result, industry: trimmed });
    setEditingIndustry(false);
  }
  function cancelIndustryEdit() {
    setEditingIndustry(false);
  }

  function startPromptEdit(index: number) {
    if (!result?.prompts) return;
    setPromptDraft(result.prompts[index].text);
    setEditingPromptIndex(index);
  }
  function savePromptEdit() {
    if (!result?.prompts || editingPromptIndex === null) return;
    const trimmed = promptDraft.trim();
    if (!trimmed) return;
    const updated = [...result.prompts];
    updated[editingPromptIndex] = { ...updated[editingPromptIndex], text: trimmed };
    setResult({ ...result, prompts: updated });
    setEditingPromptIndex(null);
  }
  function cancelPromptEdit() {
    setEditingPromptIndex(null);
  }

  async function runReport() {
    if (!result?.brandName || !result?.industry || !result?.prompts?.length || runningReport) return;
    setRunningReport(true);
    setReportError(null);
    setReportResult(null);
    try {
      const res = await fetch("/api/free-run/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName: result.brandName,
          industry: result.industry,
          prompts: result.prompts.map((p) => ({ text: p.text })),
        }),
      });
      const json: FreeExecuteResponse = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      if (json.brandSlug) {
        // Report is saved to the DB — hand the visitor off to the overview tab.
        router.push(`/entity/${json.brandSlug}/overview`);
        return;
      }
      setReportResult(json);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setRunningReport(false);
    }
  }

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
    setReportResult(null);
    setReportError(null);
    setEditingIndustry(false);
    setEditingPromptIndex(null);
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
            {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
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
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-foreground" />
          Running analysis for {brandName.trim()}…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && result.hasData && result.prompts && result.prompts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 sm:p-8 space-y-6">
          {result.industry && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Detected industry</p>
              {editingIndustry ? (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    autoFocus
                    value={industryDraft}
                    onChange={(e) => setIndustryDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); saveIndustry(); }
                      if (e.key === "Escape") { e.preventDefault(); cancelIndustryEdit(); }
                    }}
                    className="text-xl font-semibold text-foreground bg-background border border-border rounded-md px-2 py-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                  <button
                    type="button"
                    onClick={saveIndustry}
                    aria-label="Save industry"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={cancelIndustryEdit}
                    aria-label="Cancel"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-xl font-semibold text-foreground">{result.industry}</p>
                  <button
                    type="button"
                    onClick={startIndustryEdit}
                    aria-label="Edit industry"
                    className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">
              {result.prompts.length} sample questions we&apos;ll send to {modelList}:
            </p>
            <ol className="space-y-3">
              {result.prompts.map((p, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed group">
                  <span className="shrink-0 w-5 font-mono tabular-nums text-muted-foreground pt-0.5">
                    {i + 1}.
                  </span>
                  {editingPromptIndex === i ? (
                    <div className="flex-1 flex items-start gap-2">
                      <input
                        autoFocus
                        value={promptDraft}
                        onChange={(e) => setPromptDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); savePromptEdit(); }
                          if (e.key === "Escape") { e.preventDefault(); cancelPromptEdit(); }
                        }}
                        className="flex-1 text-sm text-foreground bg-background border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-foreground/20"
                      />
                      <button
                        type="button"
                        onClick={savePromptEdit}
                        aria-label="Save question"
                        className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelPromptEdit}
                        aria-label="Cancel"
                        className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-foreground">{p.text}</span>
                      <button
                        type="button"
                        onClick={() => startPromptEdit(i)}
                        aria-label={`Edit question ${i + 1}`}
                        className="shrink-0 self-start p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors opacity-60 group-hover:opacity-100"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={runReport}
              disabled={runningReport || editingIndustry || editingPromptIndex !== null}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {runningReport ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running report…
                </>
              ) : (
                "Run report"
              )}
            </button>
          </div>
          {reportError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {reportError}
            </div>
          )}
          {reportResult?.message && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground leading-relaxed">
              {reportResult.message}
            </div>
          )}
        </div>
      )}

      {result && !result.hasData && result.message && (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {result.message}
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
