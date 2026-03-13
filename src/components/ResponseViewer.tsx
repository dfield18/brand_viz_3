"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { X, ExternalLink, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseResponse, highlightBrand, type FormattedSection, type TextSegment } from "@/lib/formatResponse";
import { MODEL_LABELS } from "@/lib/constants";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface ResponseViewerData {
  /** Raw AI response text */
  responseText: string;
  /** Prompt that generated this response */
  promptText: string;
  /** AI model key (chatgpt, gemini, claude, perplexity) */
  model: string;
  /** Brand name for highlighting */
  brandName: string;
  /** Optional metadata */
  cluster?: string;
  intent?: string;
  date?: string;
  /** Optional structured analysis */
  analysis?: {
    brandMentioned?: boolean;
    brandMentionStrength?: number;
    competitors?: { name: string; mentionStrength: number }[];
    sentiment?: { legitimacy?: number; controversy?: number };
  } | null;
}

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface ResponseViewerContextValue {
  open: (data: ResponseViewerData) => void;
}

const ResponseViewerContext = createContext<ResponseViewerContextValue | null>(null);

export function useResponseViewer() {
  const ctx = useContext(ResponseViewerContext);
  if (!ctx) {
    throw new Error("useResponseViewer must be used within <ResponseViewerProvider>");
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Provider + Modal                                                    */
/* ------------------------------------------------------------------ */

export function ResponseViewerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ResponseViewerData | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((d: ResponseViewerData) => {
    setData(d);
    setIsOpen(true);
  }, []);

  return (
    <ResponseViewerContext.Provider value={{ open }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent
          className="sm:max-w-2xl max-h-[85vh] flex flex-col"
          showCloseButton={false}
        >
          {data && <ResponseModalBody data={data} onClose={() => setIsOpen(false)} />}
        </DialogContent>
      </Dialog>
    </ResponseViewerContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Modal body                                                          */
/* ------------------------------------------------------------------ */

const CLUSTER_LABELS: Record<string, string> = {
  direct: "Direct",
  related: "Related",
  comparative: "Comparative",
  network: "Network",
  industry: "Industry",
};

function ResponseModalBody({ data, onClose }: { data: ResponseViewerData; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const sections = parseResponse(data.responseText);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(data.responseText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Header */}
      <DialogHeader className="shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="text-base leading-snug">
              {data.promptText}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {MODEL_LABELS[data.model] ?? data.model}
              </span>
              {data.cluster && (
                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {CLUSTER_LABELS[data.cluster] ?? data.cluster}
                </span>
              )}
              {data.intent && (
                <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {data.intent}
                </span>
              )}
              {data.date && (
                <span className="text-xs text-muted-foreground">
                  {new Date(data.date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Copy response"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </DialogHeader>

      {/* Analysis summary bar */}
      {data.analysis && (
        <div className="shrink-0 flex flex-wrap gap-3 rounded-lg bg-muted/50 px-4 py-2.5 text-xs">
          {data.analysis.brandMentioned !== undefined && (
            <div>
              <span className="text-muted-foreground">Mentioned: </span>
              <span className={data.analysis.brandMentioned ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                {data.analysis.brandMentioned ? "Yes" : "No"}
              </span>
            </div>
          )}
          {data.analysis.brandMentionStrength !== undefined && data.analysis.brandMentionStrength > 0 && (
            <div>
              <span className="text-muted-foreground">Strength: </span>
              <span className="font-medium">{data.analysis.brandMentionStrength}/100</span>
            </div>
          )}
          {data.analysis.competitors && data.analysis.competitors.length > 0 && (
            <div>
              <span className="text-muted-foreground">Competitors: </span>
              <span className="font-medium">
                {data.analysis.competitors.slice(0, 4).map((c) => c.name).join(", ")}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Formatted response */}
      <div className="overflow-y-auto flex-1 -mx-6 px-6">
        <div className="space-y-3 pb-2">
          {sections.map((section, i) => (
            <FormattedSectionView key={i} section={section} brandName={data.brandName} />
          ))}
          {sections.length === 0 && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {data.responseText}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Section renderers                                                   */
/* ------------------------------------------------------------------ */

function FormattedSectionView({ section, brandName }: { section: FormattedSection; brandName: string }) {
  switch (section.type) {
    case "heading":
      return (
        <h3 className="text-sm font-semibold text-foreground pt-1">
          {section.text}
        </h3>
      );
    case "paragraph":
      return (
        <p className="text-sm leading-relaxed text-foreground">
          <HighlightedText text={section.text ?? ""} brandName={brandName} />
        </p>
      );
    case "list":
      if (section.ordered) {
        return (
          <ol className="space-y-1.5 pl-5 list-decimal">
            {section.items?.map((item, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground">
                <HighlightedText text={item} brandName={brandName} />
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul className="space-y-1.5 pl-5 list-disc">
          {section.items?.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed text-foreground">
              <HighlightedText text={item} brandName={brandName} />
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

/**
 * Extract the domain from a URL string (with or without protocol).
 * e.g. "closo.co/blogs/foo" → "closo.co", "https://example.com/path" → "example.com"
 */
function extractDomain(raw: string): string {
  const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
  try {
    return new URL(withProto).hostname.replace(/^www\./, "");
  } catch {
    return raw.split("/")[0];
  }
}

function ensureProtocol(raw: string): string {
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

/**
 * Renders a single URL as a clickable domain link.
 */
function UrlLink({ url }: { url: string }) {
  return (
    <a
      href={ensureProtocol(url.trim())}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:text-primary/80"
    >
      {extractDomain(url.trim())}
      <ExternalLink className="inline h-3 w-3 ml-0.5 -mt-0.5" />
    </a>
  );
}

// Bare domain URL pattern: domain.tld/path (no protocol)
const BARE_DOMAIN = /[a-zA-Z0-9][-a-zA-Z0-9]*\.[a-zA-Z]{2,}(?:\/[^\s,)]*)?/;

// Matches (in order):
// 1. Markdown links: [label](url)
// 2. Parenthesized URL groups: (url, url, ...) — with or without protocol
// 3. Bare https:// URLs
const LINK_SPLIT = new RegExp(
  `(` +
    `\\[[^\\]]+\\]\\(https?:\\/\\/[^)]+\\)` +  // [label](https://...)
    `|\\((?:(?:https?:\\/\\/)?${BARE_DOMAIN.source})(?:\\s*,\\s*(?:https?:\\/\\/)?${BARE_DOMAIN.source})*\\)` +  // (domain/path, domain/path)
    `|https?:\\/\\/[^\\s),\\]}>]+` +  // bare https://...
  `)`,
  "g"
);

function parseAndRenderLink(part: string): React.ReactNode | null {
  // Markdown link: [label](url)
  const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
  if (md) {
    return (
      <a
        href={md[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {md[1]}
        <ExternalLink className="inline h-3 w-3 ml-0.5 -mt-0.5" />
      </a>
    );
  }

  // Parenthesized URL group: (url, url, ...)
  const parenGroup = part.match(/^\((.+)\)$/);
  if (parenGroup) {
    const urls = parenGroup[1].split(/\s*,\s*/);
    // Check that at least one looks like a URL
    if (urls.some((u) => BARE_DOMAIN.test(u))) {
      return (
        <span>
          (
          {urls.map((url, i) => (
            <span key={i}>
              {i > 0 && ", "}
              <UrlLink url={url} />
            </span>
          ))}
          )
        </span>
      );
    }
  }

  // Bare https:// URL
  if (/^https?:\/\//.test(part)) {
    return <UrlLink url={part} />;
  }

  return null;
}

function TextWithLinks({ text }: { text: string }) {
  const parts = text.split(LINK_SPLIT);
  return (
    <>
      {parts.map((part, i) => {
        const rendered = parseAndRenderLink(part);
        return rendered ? (
          <span key={i}>{rendered}</span>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

function HighlightedText({ text, brandName }: { text: string; brandName: string }) {
  const segments = highlightBrand(text, brandName);
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark key={i} className="bg-primary/15 text-primary font-medium rounded px-0.5">
            {seg.text}
          </mark>
        ) : (
          <TextWithLinks key={i} text={seg.text} />
        )
      )}
    </>
  );
}
