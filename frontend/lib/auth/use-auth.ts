"use client";

import { useAuthStore } from "./token-store";

/** Convenience selector for components that only need session state/flags. */
export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  return {
    user,
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
  };
}
