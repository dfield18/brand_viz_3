"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Loader2, AlertTriangle } from "lucide-react";

export default function AccountPage() {
  const router = useRouter();
  const { signOut } = useClerk();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json();
      if (data.deleted) {
        await signOut();
        router.push("/");
      } else {
        setError(data.error || "Failed to delete account");
        setDeleting(false);
      }
    } catch {
      setError("Failed to delete account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-2">Account Settings</h1>
      <p className="text-sm text-muted-foreground mb-8">Manage your aiSaysWhat account. aiSaysWhat is a service of BrooklyEcho LLC.</p>

      <div className="space-y-6">
        {/* Back to dashboard */}
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to Dashboard
          </button>
        </div>

        {/* Danger zone */}
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
          <h2 className="text-base font-semibold text-red-900 mb-2">Delete Account</h2>
          <p className="text-sm text-red-800/70 mb-4">
            Permanently delete your account and all associated data. This will cancel any active Pro subscription. This action cannot be undone.
          </p>

          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-100 transition-colors"
            >
              Delete my account
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg bg-red-100 p-3">
                <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-800">
                  Are you sure? This will permanently delete your account, cancel your subscription, and remove all your data. You will be signed out immediately.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {deleting ? "Deleting..." : "Yes, delete my account"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
              {error && (
                <p className="text-xs text-red-600">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
