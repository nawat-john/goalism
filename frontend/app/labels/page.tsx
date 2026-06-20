"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { AppHeader } from "@/components/app-header";
import { useCreateLabel, useDeleteLabel, useLabels } from "@/lib/api/hooks";

export default function LabelsPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <Labels />
    </RequireAuth>
  );
}

function Labels() {
  const { data: labels, isLoading } = useLabels();
  const createLabel = useCreateLabel();
  const deleteLabel = useDeleteLabel();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");

  function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createLabel.mutate({ name: trimmed, color }, { onSuccess: () => setName("") });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Labels</h1>

      <form onSubmit={add} className="flex items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-9 w-10 rounded border border-input"
          aria-label="Label color"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Label name…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={createLabel.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}

      <ul className="space-y-2">
        {labels?.map((label) => (
          <li
            key={label.id}
            className="flex items-center justify-between rounded-md border border-border p-3"
          >
            <span className="flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </span>
            <button
              onClick={() => deleteLabel.mutate(label.id)}
              className="text-sm text-red-600 hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
