interface DataFooterProps {
  /** "industry" = broad industry questions only, "all" = all prompt types, "mixed" = varies by metric */
  prompts: "industry" | "all" | "mixed";
  /** "latest" = most recent snapshot, or a number for the range in days */
  date: "latest" | number;
  /** How the data in the section was computed across the date window:
   *  - "aggregated" (default) — metric aggregates every run in the range.
   *    Label reads "Last N days".
   *  - "snapshot" — metric uses the latest snapshot per (model, prompt)
   *    within the range. Label reads "Current · N-day window" so users
   *    don't assume it's a time-series average. */
  mode?: "aggregated" | "snapshot";
}

export function DataFooter({ prompts, date, mode = "aggregated" }: DataFooterProps) {
  const promptLabel =
    prompts === "industry"
      ? "Generic industry questions (no brands mentioned)"
      : prompts === "mixed"
        ? "Mention Rate uses generic industry questions (no brands mentioned); other metrics use all prompt types"
        : "All prompt types";
  const dateLabel =
    date === "latest"
      ? "Latest snapshot"
      : mode === "snapshot"
        ? `Current · ${date}-day window`
        : `Last ${date} days`;

  return (
    <p className="text-[10px] text-muted-foreground/50 text-right mt-3">
      {dateLabel} &middot; {promptLabel}
    </p>
  );
}
