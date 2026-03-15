export type FlashToastTone = "success" | "error" | "info" | "warning";

export type FlashToastPayload = {
  title?: string;
  message: string;
  tone?: FlashToastTone;
  duration?: number;
};

export type FlashToastEventDetail = FlashToastPayload & {
  id: string;
};

declare global {
  interface WindowEventMap {
    "linkedup:flash-toast": CustomEvent<FlashToastEventDetail>;
  }
}

export const FLASH_TOAST_EVENT = "linkedup:flash-toast";

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `toast_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function flashToast(payload: FlashToastPayload) {
  if (typeof window === "undefined") return;

  const detail: FlashToastEventDetail = {
    id: makeId(),
    tone: payload.tone ?? "info",
    duration: payload.duration ?? 3200,
    title: payload.title,
    message: payload.message,
  };

  window.dispatchEvent(
    new CustomEvent<FlashToastEventDetail>(FLASH_TOAST_EVENT, { detail })
  );
}

export const flash = {
  show: flashToast,
  success(message: string, title?: string, duration?: number) {
    flashToast({ tone: "success", title, message, duration });
  },
  error(message: string, title?: string, duration?: number) {
    flashToast({ tone: "error", title, message, duration });
  },
  info(message: string, title?: string, duration?: number) {
    flashToast({ tone: "info", title, message, duration });
  },
  warning(message: string, title?: string, duration?: number) {
    flashToast({ tone: "warning", title, message, duration });
  },
};