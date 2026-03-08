// lib/sessionStore.ts
import type {
  OptimizeResponse,
  GeneratedImages,
  StructuredResume,
  UserContext,
  SectionKey,
} from "./types";

export type SectionResults = Partial<
  Record<
    SectionKey,
    {
      data: unknown;
      updatedAt: string;
    }
  >
>;

export type ParseSession = {
  id: string;
  structured: StructuredResume;
  ctx: UserContext;
  sectionResults: SectionResults;
  images?: GeneratedImages;
  createdAt: string;
};

type ResultEntry = { value: OptimizeResponse; expiresAt: number };
type SessionEntry = { value: ParseSession; expiresAt: number };

const TTL_MS = 1000 * 60 * 60 * 24; // 24h

declare global {
  // eslint-disable-next-line no-var
  var __OPT_RESULT_STORE__: Map<string, ResultEntry> | undefined;

  // eslint-disable-next-line no-var
  var __OPT_SESSION_STORE__: Map<string, SessionEntry> | undefined;
}

function resultStore(): Map<string, ResultEntry> {
  if (!global.__OPT_RESULT_STORE__) {
    global.__OPT_RESULT_STORE__ = new Map();
  }
  return global.__OPT_RESULT_STORE__;
}

function sessionStore(): Map<string, SessionEntry> {
  if (!global.__OPT_SESSION_STORE__) {
    global.__OPT_SESSION_STORE__ = new Map();
  }
  return global.__OPT_SESSION_STORE__;
}

function isExpired(expiresAt: number) {
  return Date.now() > expiresAt;
}

/* ----------------------------- FINAL RESULT STORE ----------------------------- */

export function putResult(res: OptimizeResponse) {
  resultStore().set(res.id, {
    value: res,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function getResult(id: string): OptimizeResponse | null {
  const entry = resultStore().get(id);
  if (!entry) return null;

  if (isExpired(entry.expiresAt)) {
    resultStore().delete(id);
    return null;
  }

  return entry.value;
}

export function updateResultImages(
  id: string,
  images: GeneratedImages
): OptimizeResponse | null {
  const existing = getResult(id);
  if (!existing) return null;

  const updated: OptimizeResponse = {
    ...existing,
    images: {
      ...(existing.images || {}),
      ...(images || {}),
    },
  };

  putResult(updated);
  return updated;
}

/* ----------------------------- PARSE SESSION STORE ---------------------------- */

export function putParseSession(session: ParseSession) {
  sessionStore().set(session.id, {
    value: session,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function getParseSession(id: string): ParseSession | null {
  const entry = sessionStore().get(id);
  if (!entry) return null;

  if (isExpired(entry.expiresAt)) {
    sessionStore().delete(id);
    return null;
  }

  return entry.value;
}

export function updateParseSession(
  id: string,
  patch: Partial<ParseSession>
): ParseSession | null {
  const existing = getParseSession(id);
  if (!existing) return null;

  const updated: ParseSession = {
    ...existing,
    ...patch,
    sectionResults: patch.sectionResults ?? existing.sectionResults,
    images: patch.images ?? existing.images,
  };

  putParseSession(updated);
  return updated;
}

export function putSectionResult(
  id: string,
  section: SectionKey,
  data: unknown
): ParseSession | null {
  const existing = getParseSession(id);
  if (!existing) return null;

  const updated: ParseSession = {
    ...existing,
    sectionResults: {
      ...existing.sectionResults,
      [section]: {
        data,
        updatedAt: new Date().toISOString(),
      },
    },
  };

  putParseSession(updated);
  return updated;
}

export function updateParseSessionImages(
  id: string,
  images: GeneratedImages
): ParseSession | null {
  const existing = getParseSession(id);
  if (!existing) return null;

  const updated: ParseSession = {
    ...existing,
    images: {
      ...(existing.images || {}),
      ...(images || {}),
    },
  };

  putParseSession(updated);
  return updated;
}