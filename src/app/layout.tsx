import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ClientHeader } from "@/components/ClientHeader";

export const metadata: Metadata = {
  title: "AI Visibility",
  description: "AI Search Visibility Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className="antialiased"
          style={{
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <ClientHeader />
          <main className="min-h-[calc(100vh-3.75rem)]">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
