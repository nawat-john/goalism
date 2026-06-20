import type { AiMode } from "./key-store";
import { DirectGeminiProvider } from "./direct-provider";
import { ProxyGeminiProvider } from "./proxy-provider";
import type { AIProvider } from "./provider";

export * from "./provider";
export * from "./key-store";
export { parsePlan, PlanParseError } from "./parse-plan";
export { buildPrompt } from "./build-prompt";
export { DirectGeminiProvider } from "./direct-provider";
export { ProxyGeminiProvider } from "./proxy-provider";

export function getAiProvider(mode: AiMode, apiKey: string): AIProvider {
  return mode === "direct"
    ? new DirectGeminiProvider(apiKey)
    : new ProxyGeminiProvider(apiKey);
}
