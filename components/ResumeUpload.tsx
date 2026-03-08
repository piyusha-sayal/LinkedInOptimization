"use client";

import { useMemo, useRef, useState } from "react";

export function ResumeUpload({
  onFile,
  fileName,
  error,
}: {
  onFile: (f: File) => void;
  fileName?: string;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const subtitle = useMemo(() => {
    if (fileName) return `Selected: ${fileName}`;
    return "Drag and drop your resume, or click to choose a file";
  }, [fileName]);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleFile(file?: File | null) {
    if (!file) return;
    onFile(file);
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-white">Resume Upload</div>
          <div className="mt-1 text-sm leading-6 text-white/68">
            Upload PDF or DOCX. The first step parses your resume into structured profile data.
          </div>
        </div>

        <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/55">
          PDF / DOCX
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openPicker();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={[
          "mt-5 cursor-pointer rounded-2xl border px-5 py-8 transition",
          dragActive
            ? "border-[color:var(--luna-200)]/50 bg-[color:var(--luna-400)]/20"
            : "border-white/10 bg-black/25 hover:border-[color:var(--luna-200)]/35 hover:bg-black/30",
        ].join(" ")}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-white">{subtitle}</div>
            <div className="mt-1 text-xs text-white/52">
              Clean formatting improves extraction quality. Scanned PDFs may need OCR first.
            </div>
          </div>

          <div className="inline-flex rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75">
            Choose file
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-[color:var(--luna-200)]/25 bg-[color:var(--luna-400)]/15 px-3 py-2 text-sm text-white">
          {error}
        </div>
      ) : null}
    </div>
  );
}