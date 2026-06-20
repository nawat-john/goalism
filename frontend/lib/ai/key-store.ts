import { create } from "zustand";

export type AiMode = "direct" | "proxy";

const SESSION_KEY = "studyplanner.gemini-key";

function readSessionKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

interface AiKeyState {
  apiKey: string | null;
  mode: AiMode;
  rememberInSession: boolean;
  setMode: (mode: AiMode) => void;
  /** Default: in-memory only. `remember=true` opts into `sessionStorage` (never `localStorage`) — design §6.3. */
  setKey: (key: string, remember: boolean) => void;
  clearKey: () => void;
}

/**
 * The user's BYOK Gemini key lives client-side only and is never persisted to
 * `localStorage` (design §6.3): default is in-memory (lost on refresh), with
 * an explicit opt-in to `sessionStorage` (lost when the tab closes).
 */
export const useAiKeyStore = create<AiKeyState>((set) => ({
  apiKey: readSessionKey(),
  mode: "direct",
  rememberInSession: readSessionKey() !== null,
  setMode: (mode) => set({ mode }),
  setKey: (key, remember) => {
    if (typeof window !== "undefined") {
      if (remember) {
        window.sessionStorage.setItem(SESSION_KEY, key);
      } else {
        window.sessionStorage.removeItem(SESSION_KEY);
      }
    }
    set({ apiKey: key, rememberInSession: remember });
  },
  clearKey: () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
    set({ apiKey: null, rememberInSession: false });
  },
}));
