import { create } from "zustand";
import type { User } from "@study-planner/shared";

/**
 * In-memory auth state (design §4.3). The short-lived JWT access token lives
 * ONLY here — never in localStorage/sessionStorage — so a full page reload
 * drops it and the app rehydrates via the httpOnly refresh cookie on boot.
 */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  accessToken: string | null;
  user: User | null;
  status: AuthStatus;
  setSession: (accessToken: string, user: User) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "loading",
  setSession: (accessToken, user) =>
    set({ accessToken, user, status: "authenticated" }),
  clear: () => set({ accessToken: null, user: null, status: "unauthenticated" }),
}));
