import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./client";
import { useAuthStore } from "../auth/token-store";

const API = "http://localhost:3001/api/v1";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({
    accessToken: null,
    user: null,
    status: "loading",
  });
});

describe("apiFetch", () => {
  it("on 401 refreshes once, stores the new session, and retries", async () => {
    useAuthStore.setState({ accessToken: "stale", status: "authenticated" });

    const user = {
      id: "u1",
      email: "demo@studyplanner.dev",
      displayName: "Demo",
      avatarUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    const fetchMock = vi
      .fn()
      // 1. original request rejected — token is stale
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }))
      // 2. /auth/refresh succeeds with a fresh token
      .mockResolvedValueOnce(jsonResponse(200, { accessToken: "fresh", user }))
      // 3. retried request succeeds
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: boolean }>("/goals");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/auth/refresh`);
    // Retry carried the refreshed bearer token.
    const retryInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer fresh",
    );
    expect(useAuthStore.getState().accessToken).toBe("fresh");
  });

  it("clears the session and throws when refresh also fails", async () => {
    useAuthStore.setState({ accessToken: "stale", status: "authenticated" });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: "UNAUTHENTICATED" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/goals")).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("surfaces the error envelope as an ApiError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(409, {
          error: { code: "EMAIL_TAKEN", message: "already exists" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({}),
        skipAuthRetry: true,
      }),
    ).rejects.toMatchObject({ status: 409, code: "EMAIL_TAKEN" });
  });
});
