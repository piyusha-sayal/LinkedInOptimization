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

type ResultEntry  = { value: OptimizeResponse; lastActiveAt: number };
type SessionEntry = { value: ParseSession;     lastActiveAt: number };

// 5 minutes of inactivity → session expires.
// The clock resets on every read or write, so active users are never expired.
const INACTIVITY_TTL_MS = 1000 * 60 * 5;

declare global {
  // eslint-disable-next-line no-var
  var __OPT_RESULT_STORE__:  Map<string, ResultEntry>  | undefined;
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

function isInactive(lastActiveAt: number): boolean {
  return Date.now() - lastActiveAt > INACTIVITY_TTL_MS;
}

function touchResult(id: string): void {
  const entry = resultStore().get(id);
  if (entry) entry.lastActiveAt = Date.now();
}

function touchSession(id: string): void {
  const entry = sessionStore().get(id);
  if (entry) entry.lastActiveAt = Date.now();
}

/* ----------------------------- CLEAR EVERYTHING ---------------------------- */

/**
 * Wipes ALL sessions and results from the in-memory store.
 * Called by POST /api/clear-session when the user clicks "Start Over".
 */
export function clearAllSessions(): void {
  global.__OPT_RESULT_STORE__  = new Map();
  global.__OPT_SESSION_STORE__ = new Map();
}

/**
 * Clear a single session + its result by id.
 * Called by POST /api/clear-session when the user clicks "Start Over".
 */
export function clearSession(id: string): void {
  resultStore().delete(id);
  sessionStore().delete(id);
}

/* ----------------------------- FINAL RESULT STORE ----------------------------- */

export function putResult(res: OptimizeResponse) {
  resultStore().set(res.id, {
    value:        res,
    lastActiveAt: Date.now(),
  });
}

export function getResult(id: string): OptimizeResponse | null {
  const entry = resultStore().get(id);
  if (!entry) return null;

  if (isInactive(entry.lastActiveAt)) {
    resultStore().delete(id);
    return null;
  }

  touchResult(id); // user is active — reset the inactivity clock
  return entry.value;
}

export function updateResultImages(
  id: string,
  images: GeneratedImages
): OptimizeResponse | null {
  const existing = getResult(id); // getResult already touches
  if (!existing) return null;

  const updated: OptimizeResponse = {
    ...existing,
    images: {
      ...(existing.images || {}),
      ...(images          || {}),
    },
  };

  putResult(updated);
  return updated;
}

/* ----------------------------- PARSE SESSION STORE ---------------------------- */

export function putParseSession(session: ParseSession) {
  sessionStore().set(session.id, {
    value:        session,
    lastActiveAt: Date.now(),
  });
}

export function getParseSession(id: string): ParseSession | null {
  const entry = sessionStore().get(id);
  if (!entry) return null;

  if (isInactive(entry.lastActiveAt)) {
    sessionStore().delete(id);
    return null;
  }

  touchSession(id); // user is active — reset the inactivity clock
  return entry.value;
}

export function updateParseSession(
  id: string,
  patch: Partial<ParseSession>
): ParseSession | null {
  const existing = getParseSession(id); // getParseSession already touches
  if (!existing) return null;

  const updated: ParseSession = {
    ...existing,
    ...patch,
    sectionResults: patch.sectionResults ?? existing.sectionResults,
    images:         patch.images         ?? existing.images,
  };

  putParseSession(updated);
  return updated;
}

export function putSectionResult(
  id: string,
  section: SectionKey,
  data: unknown
): ParseSession | null {
  const existing = getParseSession(id); // getParseSession already touches
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
  const existing = getParseSession(id); // getParseSession already touches
  if (!existing) return null;

  const updated: ParseSession = {
    ...existing,
    images: {
      ...(existing.images || {}),
      ...(images          || {}),
    },
  };

  putParseSession(updated);
  return updated;
}