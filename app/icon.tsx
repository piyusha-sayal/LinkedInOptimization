import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 170,
          fontWeight: 800,
          letterSpacing: -8,
        }}
      >
        LU
      </div>
    ),
    size
  );
}