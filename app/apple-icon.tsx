import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at 30% 20%, #54acbf 0%, #023859 55%, #011c40 100%)",
          color: "white",
          fontSize: 68,
          fontWeight: 800,
          letterSpacing: -3,
          borderRadius: 36,
        }}
      >
        LU
      </div>
    ),
    size
  );
}