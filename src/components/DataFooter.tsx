interface DataFooterProps {
  /** "industry" = broad industry questions only, "all" = all prompt types */
  prompts: "industry" | "all";
  /** "latest" = most recent snapshot, or a number for the range in days */
  date: "latest" | number;
}

export function DataFooter({ prompts, date }: DataFooterProps) {
  const promptLabel =
    prompts === "industry"
      ? "Generic industry questions (no brands mentioned)"
      : "All prompt types";
  const dateLabel =
    date === "latest"
      ? "Latest snapshot"
      : `Last ${date} days`;

  return (
    <p className="text-[10px] text-muted-foreground/50 text-right mt-3">
      {dateLabel} &middot; {promptLabel}
    </p>
  );
}
