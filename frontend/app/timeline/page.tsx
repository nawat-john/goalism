"use client";

import { useMemo, useState } from "react";
import { milestoneTypeSchema, type MilestoneType } from "@study-planner/shared";
import { RequireAuth } from "@/components/require-auth";
import { AppHeader } from "@/components/app-header";
import {
  useCreateMilestone,
  useDeleteMilestone,
  useGoals,
  useTimeline,
} from "@/lib/api/hooks";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_WIDTH = 36;

const TYPE_COLORS: Record<MilestoneType, string> = {
  milestone: "bg-blue-500",
  deadline: "bg-red-500",
  event: "bg-purple-500",
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toDateInputValue(d: Date) {
  return startOfDay(d).toISOString().slice(0, 10);
}

export default function TimelinePage() {
  return (
    <RequireAuth>
      <AppHeader />
      <Timeline />
    </RequireAuth>
  );
}

function Timeline() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [from, setFrom] = useState(() => startOfDay(new Date(today.getTime() - 14 * DAY_MS)));
  const [to, setTo] = useState(() => startOfDay(new Date(today.getTime() + 60 * DAY_MS)));
  const [goalId, setGoalId] = useState("");

  const { data: goals } = useGoals();
  const { data, isLoading, isError } = useTimeline({
    from: from.toISOString(),
    to: to.toISOString(),
    goalId: goalId || undefined,
  });

  const createMilestone = useCreateMilestone();
  const deleteMilestone = useDeleteMilestone();

  const [title, setTitle] = useState("");
  const [type, setType] = useState<MilestoneType>("milestone");
  const [date, setDate] = useState("");

  function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || !date) return;
    createMilestone.mutate(
      {
        title: trimmed,
        type,
        date: startOfDay(new Date(date)).toISOString(),
        goalId: goalId || undefined,
      },
      {
        onSuccess: () => {
          setTitle("");
          setDate("");
        },
      },
    );
  }

  const totalDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY_MS));
  const days = useMemo(
    () => Array.from({ length: totalDays + 1 }, (_, i) => new Date(from.getTime() + i * DAY_MS)),
    [from, totalDays],
  );

  function offsetFor(dateStr: string) {
    const d = startOfDay(new Date(dateStr));
    return Math.round((d.getTime() - from.getTime()) / DAY_MS) * DAY_WIDTH;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Timeline</h1>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          From
          <input
            type="date"
            value={toDateInputValue(from)}
            onChange={(e) => e.target.value && setFrom(startOfDay(new Date(e.target.value)))}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          To
          <input
            type="date"
            value={toDateInputValue(to)}
            onChange={(e) => e.target.value && setTo(startOfDay(new Date(e.target.value)))}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Goal
          <select
            value={goalId}
            onChange={(e) => setGoalId(e.target.value)}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="">All goals</option>
            {goals?.data.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form
        onSubmit={addMilestone}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Milestone title…"
          className="min-w-[180px] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as MilestoneType)}
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        >
          {milestoneTypeSchema.options.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded-md border border-input bg-background px-2 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={createMilestone.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Add milestone
        </button>
      </form>

      {isLoading && <p className="text-muted-foreground">Loading timeline…</p>}
      {isError && <p className="text-red-600">Failed to load timeline.</p>}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div style={{ width: (totalDays + 1) * DAY_WIDTH }}>
            <div className="flex border-b border-border bg-muted/50 text-xs">
              {days.map((d) => (
                <div
                  key={d.toISOString()}
                  style={{ width: DAY_WIDTH }}
                  className={`flex-shrink-0 border-r border-border/50 py-1 text-center ${
                    d.getTime() === today.getTime() ? "bg-accent font-semibold" : ""
                  }`}
                >
                  {d.getDate() === 1 || d.getDay() === 1 ? (
                    <span>
                      {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{d.getDate()}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="relative h-12 border-b border-border">
              {data.milestones.map((m) => (
                <div
                  key={m.id}
                  style={{ left: offsetFor(m.date) }}
                  className="group absolute top-1 flex items-center gap-1"
                  title={`${m.title} — ${new Date(m.date).toLocaleDateString()}`}
                >
                  <span className={`h-3 w-3 flex-shrink-0 rounded-full ${TYPE_COLORS[m.type]}`} />
                  <span className="max-w-[140px] truncate rounded bg-card px-1 text-xs shadow">
                    {m.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteMilestone.mutate(m.id)}
                    className="hidden text-xs text-red-600 group-hover:inline"
                    aria-label={`Delete ${m.title}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="relative h-12">
              {data.cards.map(
                (c) =>
                  c.dueDate && (
                    <div
                      key={c.id}
                      style={{ left: offsetFor(c.dueDate) }}
                      className="absolute top-1 flex items-center gap-1"
                      title={`${c.title} — due ${new Date(c.dueDate).toLocaleDateString()}`}
                    >
                      <span className="h-3 w-3 flex-shrink-0 rounded-sm bg-amber-500" />
                      <span className="max-w-[140px] truncate rounded bg-card px-1 text-xs shadow">
                        {c.title}
                      </span>
                    </div>
                  ),
              )}
            </div>
          </div>
        </div>
      )}

      {data && data.milestones.length === 0 && data.cards.length === 0 && (
        <p className="text-muted-foreground">Nothing in this range.</p>
      )}
    </main>
  );
}
