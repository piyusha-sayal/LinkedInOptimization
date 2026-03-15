"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FLASH_TOAST_EVENT,
  type FlashToastEventDetail,
  type FlashToastPayload,
  type FlashToastTone,
} from "@/lib/flashToast";

type ToastItem = FlashToastPayload & {
  id: string;
  tone: FlashToastTone;
  duration: number;
};

const TONE_META: Record<
  FlashToastTone,
  { icon: string; title: string; accent: string }
> = {
  success: {
    icon: "✓",
    title: "Success",
    accent: "var(--toast-success)",
  },
  error: {
    icon: "!",
    title: "Error",
    accent: "var(--toast-error)",
  },
  warning: {
    icon: "!",
    title: "Heads up",
    accent: "var(--toast-warning)",
  },
  info: {
    icon: "i",
    title: "Info",
    accent: "var(--toast-info)",
  },
};

export default function FlashToastProvider() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, number>>({});

  useEffect(() => {
    function onToast(event: WindowEventMap["linkedup:flash-toast"]) {
      const detail: FlashToastEventDetail = event.detail;

      setToasts((prev) => [
        ...prev,
        {
          id: detail.id,
          title: detail.title,
          message: detail.message,
          tone: detail.tone ?? "info",
          duration: detail.duration ?? 3200,
        },
      ]);

      timersRef.current[detail.id] = window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== detail.id));
        delete timersRef.current[detail.id];
      }, detail.duration ?? 3200);
    }

    window.addEventListener(FLASH_TOAST_EVENT, onToast);

    return () => {
      window.removeEventListener(FLASH_TOAST_EVENT, onToast);

      Object.values(timersRef.current).forEach((timer) =>
        window.clearTimeout(timer)
      );
      timersRef.current = {};
    };
  }, []);

  function dismissToast(id: string) {
    if (timersRef.current[id]) {
      window.clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }

    setToasts((prev) => prev.filter((item) => item.id !== id));
  }

  const renderedToasts = useMemo(
    () =>
      toasts.map((toast) => {
        const meta = TONE_META[toast.tone];

        return (
          <div
            key={toast.id}
            className="flash-toast"
            style={{ ["--toast-accent" as string]: meta.accent }}
            role={toast.tone === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            <div className="flash-toast__icon">{meta.icon}</div>

            <div className="flash-toast__content">
              <div className="flash-toast__title">
                {toast.title || meta.title}
              </div>
              <div className="flash-toast__message">{toast.message}</div>
            </div>

            <button
              type="button"
              className="flash-toast__close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        );
      }),
    [toasts]
  );

  return <div className="flash-toast-stack">{renderedToasts}</div>;
}