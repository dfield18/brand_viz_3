import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "aiSaysWhat — AI brand visibility for advocacy organizations";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
          color: "white",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "12px",
              height: "56px",
              borderRadius: "6px",
              background: "linear-gradient(180deg, #10b981 0%, #059669 100%)",
            }}
          />
          <div style={{ fontSize: "32px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            aiSaysWhat
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              fontSize: "72px",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
              maxWidth: "960px",
            }}
          >
            See what ChatGPT, Gemini & Claude say about your cause.
          </div>
          <div
            style={{
              fontSize: "28px",
              color: "rgba(255,255,255,0.65)",
              maxWidth: "800px",
              lineHeight: 1.3,
            }}
          >
            AI brand visibility for advocacy organizations.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
            fontSize: "20px",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          <span>ChatGPT</span>
          <span>·</span>
          <span>Gemini</span>
          <span>·</span>
          <span>Claude</span>
          <span>·</span>
          <span>Perplexity</span>
          <span>·</span>
          <span>Google AI Overviews</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
