"use client";

import { CheckCircle2, XCircle, AlertTriangle, Minus } from "lucide-react";

// ---------------------------------------------------------------------------
// Shared check-row component
// ---------------------------------------------------------------------------

export type CheckStatus = "pass" | "fail" | "warn" | "info";

export interface CheckItem {
  label: string;
  status: CheckStatus;
  value?: string;
  detail?: string;
}

const STATUS_ICON: Record<CheckStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />,
  fail: <XCircle className="h-4 w-4 text-red-500 shrink-0" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />,
  info: <Minus className="h-4 w-4 text-muted-foreground shrink-0" />,
};

export function CheckRow({ item }: { item: CheckItem }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5">{STATUS_ICON[item.status]}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{item.label}</span>
          {item.value && (
            <span className="text-sm text-muted-foreground">{item.value}</span>
          )}
        </div>
        {item.detail && (
          <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
        )}
      </div>
    </div>
  );
}

export function CheckList({ items }: { items: CheckItem[] }) {
  return (
    <div className="divide-y divide-border">
      {items.map((item, i) => (
        <CheckRow key={i} item={item} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section wrapper (matches competition/overview style)
// ---------------------------------------------------------------------------

export function AuditSectionCard({
  id,
  title,
  subtitle,
  score,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  score?: number;
  children: React.ReactNode;
}) {
  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (s >= 60) return "text-blue-700 bg-blue-50 border-blue-200";
    if (s >= 40) return "text-amber-700 bg-amber-50 border-amber-200";
    return "text-red-700 bg-red-50 border-red-200";
  };

  return (
    <div id={id} className="scroll-mt-24">
      <section className="rounded-xl bg-card p-6 shadow-section">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {score !== undefined && (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getScoreColor(score)}`}>
              {score}/100
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>
        {children}
      </section>
    </div>
  );
}
