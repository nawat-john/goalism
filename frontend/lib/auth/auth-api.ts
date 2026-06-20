import type { LoginInput, RegisterInput, User } from "@study-planner/shared";
import { apiFetch, SessionResponse } from "../api/client";
import { useAuthStore } from "./token-store";

/**
 * Auth API calls. register/login skip the 401-refresh retry (there is no
 * session yet) and seed the in-memory store on success; logout clears it.
 */
export const authApi = {
  async register(input: RegisterInput): Promise<SessionResponse> {
    const session = await apiFetch<SessionResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuthRetry: true,
    });
    useAuthStore.getState().setSession(session.accessToken, session.user);
    return session;
  },

  async login(input: LoginInput): Promise<SessionResponse> {
    const session = await apiFetch<SessionResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
      skipAuthRetry: true,
    });
    useAuthStore.getState().setSession(session.accessToken, session.user);
    return session;
  },

  async logout(): Promise<void> {
    try {
      await apiFetch<void>("/auth/logout", { method: "POST" });
    } finally {
      useAuthStore.getState().clear();
    }
  },

  me(): Promise<User> {
    return apiFetch<User>("/auth/me");
  },
};
