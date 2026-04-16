"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useBrandName } from "@/lib/useBrandName";
import { Loader2, Mail, Check, Send } from "lucide-react";


function EmailSubscribePanel({ brandSlug }: { brandSlug: string }) {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [preferredHour, setPreferredHour] = useState(9);
  const [preferredDay, setPreferredDay] = useState(1); // weekly: 1=Mon; monthly: 1=1st
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<{ email: string; frequency: string; preferredHour?: number; preferredDay?: number; enabled: boolean }[]>([]);

  useEffect(() => {
    fetch(`/api/reports/subscribe?brandSlug=${encodeURIComponent(brandSlug)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.subscriptions) setSubscriptions(data.subscriptions); })
      .catch(() => {});
  }, [brandSlug]);

  async function handleSubscribe() {
    if (!email.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch("/api/reports/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug, email: email.trim(), frequency, preferredHour, preferredDay }),
      });
      if (res.ok) {
        setStatus("saved");
        setSubscriptions((prev) => {
          const existing = prev.find((s) => s.email === email.trim());
          if (existing) return prev.map((s) => s.email === email.trim() ? { ...s, frequency, enabled: true } : s);
          return [...prev, { email: email.trim(), frequency, enabled: true }];
        });
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  async function handleSendNow() {
    setSendStatus("sending");
    setSendError(null);
    try {
      const res = await fetch("/api/reports/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandSlug }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.sent > 0) {
        setSendStatus("sent");
        setTimeout(() => setSendStatus("idle"), 5000);
      } else {
        setSendStatus("error");
        const detail = data?.errors?.join("; ") || data?.message || data?.error || `HTTP ${res.status}`;
        setSendError(detail);
      }
    } catch (err) {
      setSendStatus("error");
      setSendError(err instanceof Error ? err.message : "Network error");
    }
  }

  const activeCount = subscriptions.filter((s) => s.enabled).length;

  return (
    <div className="rounded-xl border border-border bg-card p-5 no-print">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Email Reports</h3>
        {activeCount > 0 && (
          <span className="text-xs text-muted-foreground">({activeCount} active)</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Get this report delivered to your inbox automatically.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubscribe()}
          className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        {frequency === "weekly" && (
          <select
            value={preferredDay}
            onChange={(e) => setPreferredDay(Number(e.target.value))}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
          >
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((name, i) => (
              <option key={i} value={i}>{name}</option>
            ))}
          </select>
        )}
        {frequency === "monthly" && (
          <select
            value={preferredDay}
            onChange={(e) => setPreferredDay(Number(e.target.value))}
            className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}
              </option>
            ))}
          </select>
        )}
        <select
          value={preferredHour}
          onChange={(e) => setPreferredHour(Number(e.target.value))}
          className="text-xs px-2 py-1.5 rounded-lg border border-border bg-background"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>
              {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`} EST
            </option>
          ))}
        </select>
        <button
          onClick={handleSubscribe}
          disabled={status === "saving" || !email.trim()}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {status === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
           status === "saved" ? <Check className="h-3.5 w-3.5" /> :
           <Mail className="h-3.5 w-3.5" />}
          {status === "saved" ? "Subscribed" : "Subscribe"}
        </button>
      </div>
      {status === "error" && (
        <p className="text-xs text-red-500 mt-2">Failed to subscribe. Please try again.</p>
      )}

      {/* Send now + active subscriptions */}
      {activeCount > 0 && (
        <div className="mt-4 pt-3 border-t border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                {activeCount} subscriber{activeCount !== 1 ? "s" : ""} &mdash; {frequency === "daily" ? "Daily" : frequency === "weekly" ? `${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][preferredDay] ?? "Mondays"}` : `${preferredDay}${preferredDay === 1 ? "st" : preferredDay === 2 ? "nd" : preferredDay === 3 ? "rd" : "th"} of each month`} at {preferredHour === 0 ? "12am" : preferredHour < 12 ? `${preferredHour}am` : preferredHour === 12 ? "12pm" : `${preferredHour - 12}pm`} EST
              </p>
            </div>
            <button
              onClick={handleSendNow}
              disabled={sendStatus === "sending"}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50 transition-colors"
            >
              {sendStatus === "sending" ? <Loader2 className="h-3 w-3 animate-spin" /> :
               sendStatus === "sent" ? <Check className="h-3 w-3 text-emerald-600" /> :
               <Send className="h-3 w-3" />}
              {sendStatus === "sending" ? "Sending..." : sendStatus === "sent" ? "Sent!" : "Send now"}
            </button>
          </div>
          {sendStatus === "error" && (
            <p className="text-xs text-red-500 mt-1">Failed to send{sendError ? `: ${sendError}` : ". Check that RESEND_API_KEY is configured."}</p>
          )}

          {/* Subscription list with remove */}
          <div className="mt-3 space-y-1.5">
            {subscriptions.filter((s) => s.enabled).map((sub) => (
              <div key={sub.email} className="flex items-center justify-between text-xs py-1">
                <span className="text-muted-foreground">{sub.email} &middot; {sub.frequency}</span>
                <button
                  onClick={async () => {
                    const res = await fetch("/api/reports/subscribe", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ brandSlug, email: sub.email }),
                    });
                    if (res.ok) {
                      setSubscriptions((prev) => prev.map((s) => s.email === sub.email ? { ...s, enabled: false } : s));
                    }
                  }}
                  className="text-red-500 hover:text-red-700 transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error === "No subscription found") {
        // No Pro subscription — silently ignore
        setLoading(false);
      } else {
        alert(data.error || "Failed to open billing portal");
        setLoading(false);
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 disabled:opacity-50 transition-colors"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      Manage Pro Subscription
    </button>
  );
}

function ReportInner() {
  const params = useParams<{ slug: string }>();
  const brandName = useBrandName(params.slug);

  return (
    <div className="max-w-[900px] mx-auto px-8 py-10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">{brandName} &mdash; Reports</h1>
          <p className="text-sm text-gray-500">
            Set up automated email reports for your team.
          </p>
        </div>
        <ManageSubscriptionButton />
      </div>

      <EmailSubscribePanel brandSlug={params.slug} />
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-500">Loading report...</div>}>
      <ReportInner />
    </Suspense>
  );
}
