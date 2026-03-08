"use client";

import { useMemo, useState } from "react";

type Props = {
  resultId?: string;
  initialProfileUrl?: string;
  initialCoverUrl?: string;
};

async function downloadResizedImage(opts: {
  src: string;
  fileName: string;
  width: number;
  height: number;
  coverMode: "contain" | "cover";
}) {
  const { src, fileName, width, height, coverMode } = opts;

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image for export."));
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  const iw = img.width;
  const ih = img.height;

  const scale =
    coverMode === "cover"
      ? Math.max(width / iw, height / ih)
      : Math.min(width / iw, height / ih);

  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, dx, dy, dw, dh);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );

  if (!blob) throw new Error("Export failed.");

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

async function parseApiResponse(res: Response) {
  const raw = await res.text();

  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    if (!res.ok) {
      throw new Error(raw || `Request failed with status ${res.status}`);
    }
    throw new Error("Server returned an invalid JSON response.");
  }

  if (!res.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        raw ||
        `Request failed with status ${res.status}`
    );
  }

  return data;
}

export function LinkedInImages({
  resultId,
  initialProfileUrl,
  initialCoverUrl,
}: Props) {
  const [selfie, setSelfie] = useState<File | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [loadingCover, setLoadingCover] = useState(false);

  const [photoOut, setPhotoOut] = useState<string>(initialProfileUrl || "");
  const [coverOut, setCoverOut] = useState<string>(initialCoverUrl || "");

  const selfieName = useMemo(() => selfie?.name || "", [selfie]);

  async function persistImages(payload: {
    profilePhotoUrl?: string;
    coverUrl?: string;
  }) {
    if (!resultId) return;

    try {
      await fetch(`/api/results/${resultId}/images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
    } catch (error) {
      console.error("Failed to persist image URLs:", error);
    }
  }

  async function generatePhoto() {
    if (!selfie) {
      alert("Upload a selfie first.");
      return;
    }

    setLoadingPhoto(true);
    setPhotoOut("");

    try {
      const form = new FormData();
      form.set("image", selfie);
      form.set("file", selfie);

      const res = await fetch("/api/gemini/profile-photo", {
        method: "POST",
        body: form,
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = await parseApiResponse(res);

      if (!json?.image) {
        throw new Error("Profile photo route did not return an image.");
      }

      setPhotoOut(json.image);
      await persistImages({ profilePhotoUrl: json.image });
    } catch (e: any) {
      console.error("Profile photo generation failed:", e);
      alert(e?.message || "Profile photo generation failed");
    } finally {
      setLoadingPhoto(false);
    }
  }

  async function generateCover() {
    setLoadingCover(true);
    setCoverOut("");

    try {
      const res = await fetch("/api/gemini/cover", {
        method: "POST",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const json = await parseApiResponse(res);

      if (!json?.image) {
        throw new Error("Cover route did not return an image.");
      }

      setCoverOut(json.image);
      await persistImages({ coverUrl: json.image });
    } catch (e: any) {
      console.error("Cover generation failed:", e);
      alert(e?.message || "Cover generation failed");
    } finally {
      setLoadingCover(false);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-lg font-semibold text-white">LinkedIn Visual Assets</div>
          <div className="mt-1 text-sm leading-6 text-white/68">
            Generate a profile photo and cover banner separately from the main text workflow.
          </div>
        </div>

        {resultId ? (
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/55">
            Result linked
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-base font-semibold text-white">Profile Photo</div>
          <div className="mt-1 text-sm text-white/60">
            Use a clear front-facing selfie with even lighting.
          </div>

          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm transition hover:border-white/20">
            <span className="font-medium text-white/90">Choose selfie</span>
            <span className="max-w-[220px] truncate text-white/55">
              {selfieName || "No file chosen"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setSelfie(e.target.files?.[0] || null)}
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={generatePhoto}
              disabled={loadingPhoto}
              className={[
                "rounded-xl px-4 py-2 font-semibold transition",
                loadingPhoto
                  ? "bg-white/10 text-white/45"
                  : "bg-[color:var(--luna-200)] text-[#001018] hover:bg-[color:var(--luna-100)]",
              ].join(" ")}
            >
              {loadingPhoto ? "Generating..." : "Generate profile photo"}
            </button>

            {photoOut ? (
              <button
                onClick={() =>
                  downloadResizedImage({
                    src: photoOut,
                    fileName: "linkedin-profile-1024.png",
                    width: 1024,
                    height: 1024,
                    coverMode: "cover",
                  })
                }
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/80 transition hover:border-white/20"
              >
                Download 1024×1024
              </button>
            ) : null}
          </div>

          {photoOut ? (
            <div className="mt-4">
              <img
                src={photoOut}
                alt="Generated profile photo"
                className="max-w-[360px] rounded-2xl border border-white/10"
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="text-base font-semibold text-white">Cover Banner</div>
          <div className="mt-1 text-sm text-white/60">
            Create a clean, corporate-safe banner in LinkedIn-ready proportions.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={generateCover}
              disabled={loadingCover}
              className={[
                "rounded-xl px-4 py-2 font-semibold transition",
                loadingCover
                  ? "bg-white/10 text-white/45"
                  : "bg-[color:var(--luna-200)] text-[#001018] hover:bg-[color:var(--luna-100)]",
              ].join(" ")}
            >
              {loadingCover ? "Generating..." : "Generate cover banner"}
            </button>

            {coverOut ? (
              <button
                onClick={() =>
                  downloadResizedImage({
                    src: coverOut,
                    fileName: "linkedin-cover-1584x396.png",
                    width: 1584,
                    height: 396,
                    coverMode: "cover",
                  })
                }
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-white/80 transition hover:border-white/20"
              >
                Download 1584×396
              </button>
            ) : null}
          </div>

          {coverOut ? (
            <div className="mt-4">
              <img
                src={coverOut}
                alt="Generated cover banner"
                className="w-full rounded-2xl border border-white/10"
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}