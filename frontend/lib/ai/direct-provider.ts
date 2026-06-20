import { ApiError, GoogleGenAI } from "@google/genai";
import type { PlanRequest, PlanSuggestion } from "@study-planner/shared";
import {
  AiQuotaError,
  DEFAULT_GEMINI_MODEL,
  type AIProvider,
  type GeneratePlanOptions,
} from "./provider";
import { buildPrompt } from "./build-prompt";
import { parsePlan } from "./parse-plan";

/** Mode A (design §6.2): calls Gemini straight from the browser — the key never reaches our backend. */
export class DirectGeminiProvider implements AIProvider {
  constructor(private readonly apiKey: string) {}

  async generatePlan(
    input: PlanRequest,
    options?: GeneratePlanOptions,
  ): Promise<PlanSuggestion> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    try {
      const res = await ai.models.generateContent({
        model: input.model ?? DEFAULT_GEMINI_MODEL,
        contents: buildPrompt(input),
        config: {
          responseMimeType: "application/json",
          abortSignal: options?.signal,
        },
      });
      return parsePlan(res.text);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) throw new AiQuotaError();
      throw err;
    }
  }
}
