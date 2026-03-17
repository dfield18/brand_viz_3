"use client";

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
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
          <p className="text-xs text-muted-foreground mt-1.5">
            {MODEL_LABELS[q.model] ?? q.model}
            {q.context && <> &middot; {q.context}</>}
          </p>
        </div>
      ))}
    </div>
  );
}
