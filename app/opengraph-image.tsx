import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          background:
            "radial-gradient(circle at 20% 15%, rgba(84,172,191,0.28), transparent 35%), radial-gradient(circle at 80% 20%, rgba(167,235,242,0.18), transparent 30%), linear-gradient(180deg, #03111d 0%, #010814 100%)",
          color: "white",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(84,172,191,0.18)",
              border: "1px solid rgba(167,235,242,0.25)",
              fontSize: 34,
              fontWeight: 800,
            }}
          >
            LU
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            LinkedUp
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 66,
              lineHeight: 1.05,
              fontWeight: 800,
              maxWidth: 900,
              letterSpacing: -2,
            }}
          >
            AI LinkedIn Optimizer
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.35,
              color: "rgba(255,255,255,0.82)",
              maxWidth: 920,
            }}
          >
            Turn your resume into a stronger LinkedIn headline, About section,
            keyword plan, ATS-style score, and profile positioning.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 16,
            fontSize: 22,
            color: "#a7ebf2",
          }}
        >
          <div>Resume parsing</div>
          <div>•</div>
          <div>Keyword intelligence</div>
          <div>•</div>
          <div>ATS-style scoring</div>
        </div>
      </div>
    ),
    size
  );
}