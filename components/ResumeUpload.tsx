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
    return "Drag and drop resume, or tap to choose";
  }, [fileName]);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleFile(file?: File | null) {
    if (!file) return;
    onFile(file);
  }

  const outerClass = error
    ? "border-red-400/25 bg-red-500/[0.05] shadow-[0_18px_60px_rgba(239,68,68,0.08)]"
    : "border-white/10 bg-white/[0.04] shadow-[0_18px_60px_rgba(0,0,0,0.18)]";

  const dropClass = dragActive
    ? "border-[color:var(--luna-200)]/55 bg-[color:var(--luna-400)]/20"
    : error
      ? "border-red-400/20 bg-black/30 hover:border-red-400/35"
      : "border-white/10 bg-black/25 hover:border-[color:var(--luna-200)]/35 hover:bg-black/30";

  return (
    <div
      className={`rounded-[24px] border p-4 backdrop-blur-2xl transition-all sm:rounded-[28px] sm:p-6 ${outerClass}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[color:var(--luna-200)]/20 bg-[color:var(--luna-400)]/20 text-lg text-[color:var(--luna-100)] sm:h-11 sm:w-11">
              ↑
            </div>
            <div>
              <div className="text-[17px] font-semibold text-white sm:text-lg">
                Resume Upload
              </div>
              <div className="mt-1 text-[13px] leading-6 text-white/68 sm:text-sm">
                Upload PDF or DOCX. Parse your resume into structured profile data.
              </div>
            </div>
          </div>
        </div>

        <div className="inline-flex w-fit whitespace-nowrap rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-medium text-white/60">
          PDF/DOCX
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
        className={`mt-4 rounded-[20px] border px-4 py-5 transition-all sm:mt-5 sm:rounded-[24px] sm:px-5 sm:py-7 ${dropClass}`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">
              {subtitle}
            </div>
            <div className="mt-1 text-xs leading-6 text-white/50">
              Clean formatting improves extraction. Scanned PDFs may need OCR.
            </div>

            {fileName ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1 text-xs font-medium text-emerald-200">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/15 text-[10px]">
                  ✓
                </span>
                Ready to parse
              </div>
            ) : null}
          </div>

          <div className="inline-flex w-full shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/75 transition hover:border-white/20 hover:bg-white/10 sm:w-fit whitespace-nowrap">
            Choose file
          </div>
        </div>
      </div>
    </div>
  );
}