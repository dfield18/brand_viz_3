import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  let status: "success" | "invalid" | "already" = "invalid";
  let brandName = "";

  if (token) {
    const subscription = await prisma.emailSubscription.findUnique({
      where: { unsubscribeToken: token },
      include: { brand: true },
    });

    if (subscription) {
      brandName = subscription.brand.displayName || subscription.brand.name;
      if (!subscription.enabled) {
        status = "already";
      } else {
        await prisma.emailSubscription.update({
          where: { id: subscription.id },
          data: { enabled: false },
        });
        status = "success";
      }
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f4", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", padding: "48px 32px", background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", textAlign: "center" }}>
        {status === "success" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>Unsubscribed</h1>
            <p style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>
              You&apos;ve been unsubscribed from <strong>{brandName}</strong> aiSaysWhat reports. You won&apos;t receive any more emails for this brand.
            </p>
          </>
        )}
        {status === "already" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>Already Unsubscribed</h1>
            <p style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>
              This subscription for <strong>{brandName}</strong> was already cancelled.
            </p>
          </>
        )}
        {status === "invalid" && (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>Invalid Link</h1>
            <p style={{ fontSize: 15, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>
              This unsubscribe link is invalid or has expired.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
