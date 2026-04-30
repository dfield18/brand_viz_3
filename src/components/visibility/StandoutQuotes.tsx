"use client";

import type { ComponentType, SVGProps } from "react";
import {
  AnthropicIcon,
  GeminiIcon,
  GoogleIcon,
  OpenAIIcon,
  PerplexityIcon,
} from "@/components/landing/PlatformIcons";

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google: "Google AI Overview",
};

const MODEL_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  chatgpt: OpenAIIcon,
  gemini: GeminiIcon,
  claude: AnthropicIcon,
  perplexity: PerplexityIcon,
  google: GoogleIcon,
};

interface StandoutQuote {
  quote: string;
  model: string;
  context: string;
}

interface StandoutQuotesProps {
  quotes: StandoutQuote[];
}

export function StandoutQuotes({ quotes }: StandoutQuotesProps) {
  if (!quotes || quotes.length === 0) return null;

  return (
    <div className="divide-y divide-border/50">
      {quotes.map((q, i) => (
        <div key={i} className={i === 0 ? "pb-4" : "py-4"}>
          <p className="text-sm italic text-foreground leading-relaxed">
            &ldquo;{q.quote}&rdquo;
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 inline-flex items-center gap-1.5">
            {(() => {
              const Icon = MODEL_ICONS[q.model];
              return Icon ? <Icon className="h-3 w-3 shrink-0" /> : null;
            })()}
            <span>
              {MODEL_LABELS[q.model] ?? q.model}
              {q.context && <> &middot; {q.context}</>}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}
