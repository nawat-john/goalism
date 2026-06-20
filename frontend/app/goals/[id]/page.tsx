"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { goalStatusSchema, type GoalStatus } from "@study-planner/shared";
import { RequireAuth } from "@/components/require-auth";
import { AppHeader } from "@/components/app-header";
import { AiPlanPanel } from "@/components/ai-plan-panel";
import {
  useCreateBoard,
  useDeleteGoal,
  useGoal,
  useUpdateGoal,
} from "@/lib/api/hooks";

export default function GoalPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <GoalDetail />
    </RequireAuth>
  );
}

function GoalDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: goal, isLoading, isError } = useGoal(params.id);
  const updateGoal = useUpdateGoal(params.id);
  const deleteGoal = useDeleteGoal();
  const createBoard = useCreateBoard(params.id);
  const [boardTitle, setBoardTitle] = useState("");

  if (isLoading) return <Centered>Loading…</Centered>;
  if (isError || !goal) return <Centered>Goal not found.</Centered>;

  function addBoard(e: React.FormEvent) {
    e.preventDefault();
    const title = boardTitle.trim();
    if (!title) return;
    createBoard.mutate(
      { title, goalId: params.id },
      { onSuccess: () => setBoardTitle("") },
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← All goals
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{goal.title}</h1>
          {goal.description && (
            <p className="mt-1 text-muted-foreground">{goal.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AiPlanPanel goal={goal} />
          <select
            value={goal.status}
            onChange={(e) =>
              updateGoal.mutate({ status: e.target.value as GoalStatus })
            }
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {goalStatusSchema.options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (confirm("Delete this goal?")) {
                deleteGoal.mutate(goal.id, {
                  onSuccess: () => router.replace("/"),
                });
              }
            }}
            className="rounded-md border border-input px-3 py-1 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Boards</h2>
        <form onSubmit={addBoard} className="flex gap-2">
          <input
            value={boardTitle}
            onChange={(e) => setBoardTitle(e.target.value)}
            placeholder="New board title…"
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={createBoard.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Add board
          </button>
        </form>

        {goal.boards.length === 0 ? (
          <p className="text-muted-foreground">No boards yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {goal.boards.map((board) => (
              <li key={board.id}>
                <Link
                  href={`/boards/${board.id}`}
                  className="block rounded-lg border border-border bg-card p-4 hover:bg-accent"
                >
                  <h3 className="font-medium">{board.title}</h3>
                  {board.description && (
                    <p className="text-sm text-muted-foreground">
                      {board.description}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {goal.milestones.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Milestones</h2>
          <ul className="space-y-1 text-sm">
            {goal.milestones.map((m) => (
              <li key={m.id} className="flex justify-between border-b py-1">
                <span>{m.title}</span>
                <span className="text-muted-foreground">
                  {new Date(m.date).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
      {children}
    </div>
  );
}
