import { afterEach, describe, expect, it } from "vitest";
import { useAiKeyStore } from "./key-store";

const SESSION_KEY = "studyplanner.gemini-key";

afterEach(() => {
  window.sessionStorage.removeItem(SESSION_KEY);
  useAiKeyStore.setState({
    apiKey: null,
    mode: "direct",
    rememberInSession: false,
  });
});

describe("useAiKeyStore", () => {
  it("defaults to in-memory only — nothing written to sessionStorage", () => {
    useAiKeyStore.getState().setKey("secret-key", false);
    expect(useAiKeyStore.getState().apiKey).toBe("secret-key");
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("persists to sessionStorage only on explicit opt-in", () => {
    useAiKeyStore.getState().setKey("secret-key", true);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBe("secret-key");
  });

  it("never touches localStorage", () => {
    useAiKeyStore.getState().setKey("secret-key", true);
    expect(window.localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("clearKey wipes both the store and sessionStorage", () => {
    useAiKeyStore.getState().setKey("secret-key", true);
    useAiKeyStore.getState().clearKey();
    expect(useAiKeyStore.getState().apiKey).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("switches mode independently of the key", () => {
    useAiKeyStore.getState().setMode("proxy");
    expect(useAiKeyStore.getState().mode).toBe("proxy");
  });
});
