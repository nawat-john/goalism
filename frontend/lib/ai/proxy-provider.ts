import type { PlanRequest, PlanSuggestion } from "@study-planner/shared";
import { useAuthStore } from "../auth/token-store";
import {
  AiQuotaError,
  DEFAULT_GEMINI_MODEL,
  type AIProvider,
  type GeneratePlanOptions,
} from "./provider";
import { buildPrompt } from "./build-prompt";
import { parsePlan } from "./parse-plan";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Mode B (design §6.2): the key travels only in the `x-user-gemini-key`
 * header of this one request — never in the body, never via `?key=` — and
 * the backend forwards it to Gemini as a stateless pass-through.
 */
export class ProxyGeminiProvider implements AIProvider {
  constructor(private readonly apiKey: string) {}

  async generatePlan(
    input: PlanRequest,
    options?: GeneratePlanOptions,
  ): Promise<PlanSuggestion> {
    const model = input.model ?? DEFAULT_GEMINI_MODEL;
    const res = await fetch(`${API_URL}/ai/proxy/generate`, {
      method: "POST",
      credentials: "include",
      signal: options?.signal,
      headers: {
        "Content-Type": "application/json",
        "x-user-gemini-key": this.apiKey,
        Authorization: `Bearer ${useAuthStore.getState().accessToken ?? ""}`,
      },
      body: JSON.stringify({
        model,
        payload: {
          contents: [{ parts: [{ text: buildPrompt(input) }] }],
          generationConfig: { responseMimeType: "application/json" },
        },
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { code?: string; message?: string } }
        | null;
      if (body?.error?.code === "AI_QUOTA_EXCEEDED") throw new AiQuotaError();
      throw new Error(body?.error?.message ?? "AI proxy request failed");
    }

    const data = (await res.json()) as GeminiGenerateContentResponse;
    return parsePlan(data.candidates?.[0]?.content?.parts?.[0]?.text);
  }
}
