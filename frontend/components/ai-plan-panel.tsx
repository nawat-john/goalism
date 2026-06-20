"use client";

import { useState } from "react";
import type { Goal, PlanSuggestion } from "@study-planner/shared";
import { useApplyPlan } from "@/lib/api/hooks";
import {
  AiQuotaError,
  DEFAULT_GEMINI_MODEL,
  PlanParseError,
  getAiProvider,
  useAiKeyStore,
  type AiMode,
} from "@/lib/ai";

/**
 * AI assistant panel (design §6): user supplies their own Gemini key, picks
 * direct-vs-proxy mode, reviews the JSON-validated suggestion, then accepts
 * it to persist via the normal apply-plan endpoint — AI never writes to the
 * DB directly.
 */
export function AiPlanPanel({ goal }: { goal: Goal }) {
  const [open, setOpen] = useState(false);
  const apiKey = useAiKeyStore((s) => s.apiKey);
  const mode = useAiKeyStore((s) => s.mode);
  const rememberInSession = useAiKeyStore((s) => s.rememberInSession);
  const setKey = useAiKeyStore((s) => s.setKey);
  const setMode = useAiKeyStore((s) => s.setMode);
  const clearKey = useAiKeyStore((s) => s.clearKey);

  const [keyInput, setKeyInput] = useState(apiKey ?? "");
  const [remember, setRemember] = useState(rememberInSession);
  const [context, setContext] = useState("");
  const [suggestion, setSuggestion] = useState<PlanSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);
  const applyPlan = useApplyPlan(goal.id);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-input px-3 py-1 text-sm hover:bg-accent"
      >
        ✨ AI Plan
      </button>
    );
  }

  async function generate() {
    const key = keyInput.trim();
    if (!key) {
      setError("Enter your Gemini API key first.");
      return;
    }
    setError(null);
    setSuggestion(null);
    setKey(key, remember);

    const abort = new AbortController();
    setController(abort);
    setLoading(true);
    try {
      const provider = getAiProvider(mode, key);
      const result = await provider.generatePlan(
        {
          goalTitle: goal.title,
          context: context.trim() || undefined,
          model: DEFAULT_GEMINI_MODEL,
        },
        { signal: abort.signal },
      );
      setSuggestion(result);
    } catch (err) {
      if (abort.signal.aborted) {
        setError("Cancelled.");
      } else if (err instanceof AiQuotaError || err instanceof PlanParseError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to generate a plan.");
      }
    } finally {
      setLoading(false);
      setController(null);
    }
  }

  function accept() {
    if (!suggestion) return;
    applyPlan.mutate(
      { cards: suggestion.cards, milestones: suggestion.milestones },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">AI Plan Assistant</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-muted-foreground hover:underline"
        >
          Close
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Gemini API key</span>
          <input
            type="password"
            autoComplete="off"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="AIza…"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="block text-xs text-muted-foreground">
            For safety, restrict this key by HTTP referrer in{" "}
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Google AI Studio
            </a>
            .
          </span>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as AiMode)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="direct">Direct (browser → Gemini)</option>
            <option value="proxy">Proxy (via our backend)</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember key for this tab (sessionStorage; cleared on tab close)
        </label>
        {apiKey && (
          <button
            onClick={() => {
              clearKey();
              setKeyInput("");
              setRemember(false);
            }}
            className="text-xs text-red-600 hover:underline"
          >
            Forget saved key
          </button>
        )}
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">
          Extra context (optional) — timeframe, constraints, current progress…
        </span>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate plan"}
        </button>
        {loading && (
          <button
            onClick={() => controller?.abort()}
            className="text-sm text-muted-foreground hover:underline"
          >
            Cancel
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {suggestion && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-sm">{suggestion.summary}</p>
          <ul className="space-y-1 text-sm">
            {suggestion.cards.map((c, i) => (
              <li key={i} className="flex justify-between gap-3 border-b py-1">
                <span>{c.title}</span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {c.priority ?? "medium"}
                  {c.dueDate ? ` · ${c.dueDate}` : ""}
                </span>
              </li>
            ))}
          </ul>
          {suggestion.milestones && suggestion.milestones.length > 0 && (
            <ul className="space-y-1 text-sm">
              {suggestion.milestones.map((m, i) => (
                <li key={i} className="flex justify-between gap-3 border-b py-1">
                  <span>{m.title}</span>
                  <span className="whitespace-nowrap text-muted-foreground">{m.date}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button
              onClick={accept}
              disabled={applyPlan.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {applyPlan.isPending ? "Adding…" : "Accept & add to board"}
            </button>
            <button
              onClick={() => setSuggestion(null)}
              className="rounded-md border border-input px-4 py-2 text-sm hover:bg-accent"
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
