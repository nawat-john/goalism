"use client";

import { useState } from "react";
import Link from "next/link";
import { goalStatusSchema, type GoalStatus } from "@study-planner/shared";
import { RequireAuth } from "@/components/require-auth";
import { AppHeader } from "@/components/app-header";
import { useCreateGoal, useGoals } from "@/lib/api/hooks";

const STATUS_COLORS: Record<GoalStatus, string> = {
  active: "bg-green-100 text-green-800",
  achieved: "bg-blue-100 text-blue-800",
  on_hold: "bg-yellow-100 text-yellow-800",
  archived: "bg-gray-100 text-gray-700",
};

export default function DashboardPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const { data, isLoading, isError } = useGoals();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your goals</h1>
      </div>

      <CreateGoalForm />

      {isLoading && <p className="text-muted-foreground">Loading goals…</p>}
      {isError && <p className="text-red-600">Failed to load goals.</p>}

      {data && data.data.length === 0 && (
        <p className="text-muted-foreground">No goals yet. Create your first one above.</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.data.map((goal) => (
          <li key={goal.id}>
            <Link
              href={`/goals/${goal.id}`}
              className="block h-full rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{goal.title}</h2>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${STATUS_COLORS[goal.status]}`}
                >
                  {goal.status}
                </span>
              </div>
              {goal.description && (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {goal.description}
                </p>
              )}
              <div className="mt-3 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-primary"
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

function CreateGoalForm() {
  const [title, setTitle] = useState("");
  const createGoal = useCreateGoal();
  // Touch the shared enum so the contract stays exercised at build time.
  void goalStatusSchema;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    createGoal.mutate(
      { title: trimmed },
      { onSuccess: () => setTitle("") },
    );
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New goal title…"
        className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="submit"
        disabled={createGoal.isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {createGoal.isPending ? "Adding…" : "Add goal"}
      </button>
    </form>
  );
}
