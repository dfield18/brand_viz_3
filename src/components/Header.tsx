"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useCallback, useMemo, useEffect, Suspense } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { RunPromptsPanel } from "@/components/RunPromptsPanel";
import { ModelKey } from "@/types/api";
import { dataClient } from "@/dataClient";
import { useBrands, invalidateBrands } from "@/lib/useBrands";
import { useBrandName } from "@/lib/useBrandName";
import { PRESET_BRAND_SLUGS } from "@/lib/brandViewLimit";
import { FREE_TIER_CONFIG } from "@/config/freeTier";
import { BrandSelector } from "./BrandSelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AnalyzeRunner } from "@/components/AnalyzeRunner";
import { PromptEditor } from "@/components/PromptEditor";
import { FreeRunOverlay } from "@/components/FreeRunOverlay";
import { UserButton, useAuth } from "@clerk/nextjs";

interface ValidationResult {
  valid: boolean;
  ambiguous: boolean;
  canonicalName: string;
  suggestion: string | null;
  category: string;
  entityType: "company" | "cause";
  alternatives: { name: string; description: string }[];
}

function HeaderInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { isSignedIn } = useAuth();
  const { brands } = useBrands();
  const [addOpen, setAddOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [runningSlug, setRunningSlug] = useState<string | null>(null);
  const [editPromptsSlug, setEditPromptsSlug] = useState<string | null>(null);
  const [editPromptsBrandName, setEditPromptsBrandName] = useState<string>("");
  const [addError, setAddError] = useState<string | null>(null);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [entityType, setEntityType] = useState<"company" | "cause">("cause");
  const [runOpen, setRunOpen] = useState(false);
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [runningSuggestion, setRunningSuggestion] = useState<string | null>(null);
  const [refreshToast, setRefreshToast] = useState(false);

  // Auto-dismiss the "Report refreshed" toast after 3s. Cleanup on unmount
  // cancels the pending timeout so we don't call setState on a dead
  // component if the route changes mid-toast.
  useEffect(() => {
    if (!refreshToast) return;
    const t = setTimeout(() => setRefreshToast(false), 3000);
    return () => clearTimeout(t);
  }, [refreshToast]);

  // Check pro status
  useEffect(() => {
    if (!pathname.startsWith("/entity/")) return;
    fetch("/api/brand-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandSlug: PRESET_BRAND_SLUGS[0] }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setIsPro(data.isPro ?? false); })
      .catch(() => {});
  }, [pathname]);

  // Filter brands for free users — only show presets
  const visibleBrands = isPro === false
    ? brands.filter((b) => PRESET_BRAND_SLUGS.includes(b.slug))
    : brands;

  const range = (Number(searchParams.get("range")) || 90) as 7 | 30 | 90;
  const model = (searchParams.get("model") || "all") as "all" | ModelKey;

  const currentSlug = useMemo(() => {
    const match = pathname.match(/^\/entity\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);
  // Resolve the current brand's display name from /api/brand-info so the
  // dropdown label works even when the user's own brand list doesn't include
  // the slug (e.g. an anonymous free-tier visitor viewing their just-run
  // brand).
  const currentBrandName = useBrandName(currentSlug);

  function handleBrandChange(slug: string) {
    dataClient.setLastViewedBrand(slug);
    const params = new URLSearchParams(searchParams.toString());
    router.push(`/entity/${slug}/overview?${params.toString()}`);
  }

  function handleAddBrand() {
    setNewBrandName("");
    setRunningSlug(null);
    setEditPromptsSlug(null);
    setEditPromptsBrandName("");
    setAddError(null);
    setValidation(null);
    setEntityType("company");
    setAddOpen(true);
  }

  function proceedWithBrand(name: string, type?: "company" | "cause") {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const existing = brands.find((b) => b.slug === slug);
    if (existing) {
      setAddError(`"${existing.name}" already exists.`);
      return;
    }

    // Also save to localStorage so it's available immediately before analysis completes
    const created = dataClient.createBrand({ name });
    dataClient.setLastViewedBrand(created.slug);
    if (type) setEntityType(type);
    setEditPromptsSlug(slug);
    setEditPromptsBrandName(name);
    setValidation(null);
  }

  async function handleCreateBrand() {
    const trimmed = newBrandName.trim();
    if (!trimmed) return;
    setAddError(null);
    setValidation(null);

    // Check for duplicate first
    const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const existing = brands.find((b) => b.slug === slug);
    if (existing) {
      setAddError(`"${existing.name}" already exists.`);
      return;
    }

    // Validate via OpenAI
    setValidating(true);
    try {
      const res = await fetch("/api/validate-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const result: ValidationResult = await res.json();

      if (result.ambiguous && result.alternatives.length > 1) {
        // Ambiguous — ask user to pick
        setValidation(result);
      } else if (result.valid) {
        // Brand is valid — use canonical name (properly formatted)
        proceedWithBrand(result.canonicalName || trimmed, result.entityType);
      } else {
        // Invalid — show suggestion or error
        setValidation(result);
      }
    } catch {
      // On network error, proceed with the name as-is
      proceedWithBrand(trimmed);
    } finally {
      setValidating(false);
    }
  }

  const handleAnalysisDone = useCallback((slug: string, execModel: string) => {
    setAddOpen(false);
    setRunningSlug(null);
    invalidateBrands(); // Refetch brand list from server after new analysis completes
    const params = new URLSearchParams(searchParams.toString());
    params.set("model", execModel);
    router.push(`/entity/${slug}/overview?${params.toString()}`);
  }, [router, searchParams]);

  const isEntityPage = pathname.startsWith("/entity/");
  const isLandingPage = pathname === "/";

  if (isLandingPage) return null;

  return (
    <>
      <header className="border-b border-border/60 bg-card sticky top-0 z-50 shadow-[0_1px_3px_0_hsl(0_0%_0%/0.04),0_2px_8px_-2px_hsl(0_0%_0%/0.06)]">
        <div className="max-w-[1220px] mx-auto flex items-center justify-between h-[var(--header-height)] px-3 sm:px-6">
          {/* Left: Logo — links to dashboard when signed in, home otherwise
              so an anonymous free-tier visitor doesn't get bounced to sign-in.
              Uses next/link so navigation is client-side (instant) instead
              of the plain <a> full-page reload that left the user staring at
              an unchanged screen for ~500ms after clicking. active:opacity-60
              gives an immediate tap flash so the click registers visually
              before the route change lands. */}
          <Link
            href={isSignedIn ? "/dashboard" : "/"}
            className="flex items-center gap-2 sm:gap-3 hover:opacity-80 active:opacity-60 transition-opacity shrink-0"
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#111827] shadow-sm">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="7" y1="11" x2="25" y2="11" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="7" y1="16" x2="21" y2="16" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
                <line x1="7" y1="21" x2="17" y2="21" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
              </svg>
            </div>
            {/* Hide the wordmark on entity pages below sm so the brand selector
                and rerun button have room. Non-entity pages keep it visible. */}
            <span className={`text-[15px] font-semibold tracking-tight text-foreground ${isEntityPage ? "hidden sm:inline" : ""}`}>
              aiSaysWhat
            </span>
          </Link>

          {/* Center-left: Brand selector */}
          {isEntityPage && (
            <div className="flex-1 min-w-0 flex justify-start ml-2 sm:ml-6">
              <BrandSelector
                brands={visibleBrands}
                currentSlug={currentSlug}
                currentBrandName={currentBrandName}
                onSelect={handleBrandChange}
                onAddBrand={handleAddBrand}
                canAddBrand={isSignedIn !== false}
                suggestedBrands={isSignedIn === false ? FREE_TIER_CONFIG.exampleBrands : undefined}
                onSuggestedSelect={(name) => {
                  // Keep the user on the current entity page; the
                  // overlay runs the free-tier pipeline and
                  // hard-navigates to the new brand's overview on
                  // success. No bounce to the homepage.
                  setRunningSuggestion(name);
                }}
                onSearchNew={() => router.push("/")}
              />
            </div>
          )}

          {/* Right: Run button + User avatar */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isEntityPage && currentSlug && (
              <button
                onClick={() => setRunOpen(true)}
                aria-label="Rerun analysis"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2 sm:px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <RefreshCw className="h-3 w-3" />
                <span className="hidden sm:inline">Rerun</span>
              </button>
            )}
            <UserButton />
          </div>
        </div>
      </header>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open && runningSlug) {
            setCloseBlocked(true);
            setTimeout(() => setCloseBlocked(false), 2000);
            return;
          }
          setAddOpen(open);
        }}
      >
        <DialogContent className={runningSlug ? "sm:max-w-md" : editPromptsSlug ? "sm:max-w-2xl" : "sm:max-w-md"} showCloseButton={!runningSlug}>
          <DialogHeader>
            <DialogTitle>
              {runningSlug ? "Analyzing Brand" : editPromptsSlug ? `Prompts for ${editPromptsBrandName}` : "Add Brand"}
            </DialogTitle>
          </DialogHeader>

          {runningSlug ? (
            <div className="mt-2">
              {closeBlocked && (
                <p className="text-xs text-amber-600 mb-2">
                  Please wait for analysis to finish.
                </p>
              )}
              <AnalyzeRunner
                brandSlug={runningSlug}
                model="all"
                range={range}
                onDone={handleAnalysisDone}
              />
            </div>
          ) : editPromptsSlug ? (
            <div className="mt-2 max-h-[60vh] overflow-y-auto">
              {/* Entity type indicator with toggle */}
              <div className="flex items-center gap-2 mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">Detected as:</span>
                <div className="flex items-center rounded-md border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setEntityType("cause")}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                      entityType === "cause"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    Cause / Advocacy
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntityType("company")}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                      entityType === "company"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    Company
                  </button>
                </div>
              </div>
              <PromptEditor
                brandSlug={editPromptsSlug}
                brandName={editPromptsBrandName}
                entityType={entityType}
                onStartAnalysis={() => {
                  setRunningSlug(editPromptsSlug);
                  setEditPromptsSlug(null);
                }}
              />
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateBrand();
              }}
              className="flex flex-col gap-4 mt-2"
            >
              <Input
                placeholder="Brand or topic name"
                value={newBrandName}
                onChange={(e) => {
                  setNewBrandName(e.target.value);
                  if (addError) setAddError(null);
                  if (validation) setValidation(null);
                }}
                autoFocus
                disabled={validating}
              />
              {addError && (
                <p className="text-sm text-red-600">{addError}</p>
              )}
              {/* Ambiguous — multiple possible matches */}
              {validation && validation.ambiguous && validation.alternatives.length > 1 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 space-y-2.5">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    &ldquo;{newBrandName.trim()}&rdquo; could refer to several things. Which did you mean?
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {validation.alternatives.map((alt) => (
                      <button
                        key={alt.name}
                        type="button"
                        onClick={() => {
                          const type = validation.entityType;
                          setValidation(null);
                          proceedWithBrand(alt.name, type);
                        }}
                        className="flex items-start gap-3 rounded-md border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-950/20 px-3 py-2 text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground">{alt.name}</span>
                        <span className="text-xs text-muted-foreground">{alt.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Invalid — typo or unrecognized */}
              {validation && !validation.ambiguous && !validation.valid && (() => {
                const inputLower = newBrandName.trim().toLowerCase();
                const canonicalLower = (validation.canonicalName || "").toLowerCase();
                const hasSuggestion = validation.suggestion || (validation.canonicalName && canonicalLower !== inputLower);
                return (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2 overflow-hidden">
                    <p className="text-sm text-amber-800 dark:text-amber-300 break-words">
                      {validation.suggestion
                        ? validation.suggestion
                        : hasSuggestion
                          ? `Did you mean "${validation.canonicalName}"?`
                          : `"${newBrandName.trim()}" doesn't appear to be a recognized brand or topic.`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {hasSuggestion && validation.canonicalName && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            const type = validation.entityType;
                            setValidation(null);
                            proceedWithBrand(validation.canonicalName, type);
                          }}
                        >
                          Search for &ldquo;{validation.canonicalName}&rdquo;
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const type = validation.entityType;
                          setValidation(null);
                          proceedWithBrand(newBrandName.trim(), type);
                        }}
                      >
                        Use &ldquo;{newBrandName.trim()}&rdquo; anyway
                      </Button>
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!newBrandName.trim() || validating || !!validation}>
                  {validating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      Checking...
                    </>
                  ) : (
                    "Analyze"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Run Prompts dialog */}
      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run Prompts</DialogTitle>
          </DialogHeader>
          {currentSlug && (
            <RunPromptsPanel
              brandSlug={currentSlug}
              model={model}
              range={range}
              onComplete={() => {
                // Dismiss the dialog so the user can see the refreshed
                // entity page, fire a page-level toast for explicit
                // confirmation, and router.refresh() so any Server
                // Component data on the page re-fetches along with the
                // client-side cache that RunPromptsPanel already cleared.
                setRunOpen(false);
                setRefreshToast(true);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* In-place free-run overlay for signed-out users picking a
          suggested brand from the dropdown. Runs the pipeline without
          bouncing to the homepage, then hard-navigates to the new
          entity page on success. */}
      {runningSuggestion && (
        <FreeRunOverlay
          brandName={runningSuggestion}
          promptCount={FREE_TIER_CONFIG.promptCount}
          models={FREE_TIER_CONFIG.models}
          onCancel={() => setRunningSuggestion(null)}
        />
      )}

      {/* Rerun success toast — fires when RunPromptsPanel finishes a
          successful run. Fixed-positioned below the sticky header so
          it's clearly visible on top of the entity page content while
          the per-section loading skeletons re-render with fresh data. */}
      {refreshToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-[calc(var(--header-height)+1rem)] z-50 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 shadow-md animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Report refreshed — showing latest data
        </div>
      )}
    </>
  );
}

export function Header() {
  return (
    <Suspense fallback={<header className="border-b border-border/60 bg-card h-[var(--header-height)]" />}>
      <HeaderInner />
    </Suspense>
  );
}
