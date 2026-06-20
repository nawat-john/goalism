"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card } from "@study-planner/shared";
import type { BoardWithColumns, ColumnWithCards } from "@/lib/api/resources";
import { RequireAuth } from "@/components/require-auth";
import { AppHeader } from "@/components/app-header";
import { positionBetween } from "@/lib/position";
import {
  useBoard,
  useCreateCard,
  useCreateColumn,
  useDeleteCard,
  useMoveCard,
  useUpdateCard,
} from "@/lib/api/hooks";

export default function BoardPage() {
  return (
    <RequireAuth>
      <AppHeader />
      <BoardView />
    </RequireAuth>
  );
}

function findColumnContainingCard(board: BoardWithColumns, cardId: string) {
  return board.columns.find((c) => c.cards.some((card) => card.id === cardId));
}

function BoardView() {
  const params = useParams<{ id: string }>();
  const { data: board, isLoading, isError } = useBoard(params.id);

  if (isLoading)
    return <p className="p-6 text-muted-foreground">Loading board…</p>;
  if (isError || !board)
    return <p className="p-6 text-muted-foreground">Board not found.</p>;

  return <BoardLoaded board={board} />;
}

function BoardLoaded({ board }: { board: BoardWithColumns }) {
  const createColumn = useCreateColumn(board.id);
  const moveCard = useMoveCard(board.id);
  const [columnTitle, setColumnTitle] = useState("");
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function addColumn(e: React.FormEvent) {
    e.preventDefault();
    const title = columnTitle.trim();
    if (!title) return;
    createColumn.mutate({ title }, { onSuccess: () => setColumnTitle("") });
  }

  function handleDragStart(event: DragStartEvent) {
    const cardId = String(event.active.id);
    const card = findColumnContainingCard(board, cardId)?.cards.find(
      (c) => c.id === cardId,
    );
    setActiveCard(card ?? null);
  }

  // Drag-end computes the destination's fractional position client-side and
  // sends a single PATCH /cards/:id/move (design: optimistic update, server
  // never renumbers a whole column).
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    if (!over || active.id === over.id) return;

    const cardId = String(active.id);
    const sourceColumn = findColumnContainingCard(board, cardId);
    if (!sourceColumn) return;

    const overId = String(over.id);
    const overIsColumn = board.columns.some((c) => c.id === overId);
    const destColumn = overIsColumn
      ? board.columns.find((c) => c.id === overId)
      : findColumnContainingCard(board, overId);
    if (!destColumn) return;

    const destCards = destColumn.cards.filter((c) => c.id !== cardId);
    const overIndex = overIsColumn
      ? destCards.length
      : destCards.findIndex((c) => c.id === overId);
    const insertIndex = overIndex === -1 ? destCards.length : overIndex;

    const before = insertIndex > 0 ? destCards[insertIndex - 1].position : null;
    const after =
      insertIndex < destCards.length ? destCards[insertIndex].position : null;
    const position = positionBetween(before, after);

    moveCard.mutate({ id: cardId, input: { columnId: destColumn.id, position } });
  }

  return (
    <main className="space-y-4 p-6">
      <div>
        {board.goalId && (
          <Link
            href={`/goals/${board.goalId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to goal
          </Link>
        )}
        <h1 className="text-2xl font-bold">{board.title}</h1>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex items-start gap-4 overflow-x-auto pb-4">
          {board.columns.map((column) => (
            <ColumnView key={column.id} boardId={board.id} column={column} />
          ))}

          <form
            onSubmit={addColumn}
            className="w-72 shrink-0 space-y-2 rounded-lg border border-dashed border-border p-3"
          >
            <input
              value={columnTitle}
              onChange={(e) => setColumnTitle(e.target.value)}
              placeholder="New column…"
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={createColumn.isPending}
              className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Add column
            </button>
          </form>
        </div>

        <DragOverlay>
          {activeCard ? <CardPreview card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>
    </main>
  );
}

function ColumnView({
  boardId,
  column,
}: {
  boardId: string;
  column: ColumnWithCards;
}) {
  const createCard = useCreateCard(boardId);
  const updateCard = useUpdateCard(boardId);
  const deleteCard = useDeleteCard(boardId);
  const [title, setTitle] = useState("");
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  function addCard(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    createCard.mutate(
      { columnId: column.id, input: { title: trimmed } },
      { onSuccess: () => setTitle("") },
    );
  }

  return (
    <section
      ref={setNodeRef}
      className={`w-72 shrink-0 space-y-3 rounded-lg border p-3 ${
        isOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{column.title}</h2>
        <span className="text-xs text-muted-foreground">
          {column.cards.length}
          {column.wipLimit ? ` / ${column.wipLimit}` : ""}
        </span>
      </div>

      <SortableContext
        items={column.cards.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="min-h-8 space-y-2">
          {column.cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              onToggle={(isCompleted) =>
                updateCard.mutate({ id: card.id, input: { isCompleted } })
              }
              onDelete={() => deleteCard.mutate(card.id)}
            />
          ))}
        </ul>
      </SortableContext>

      <form onSubmit={addCard} className="space-y-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a card…"
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </form>
    </section>
  );
}

function CardItem({
  card,
  onToggle,
  onDelete,
}: {
  card: Card;
  onToggle: (isCompleted: boolean) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group rounded-md border border-border bg-card p-2 text-sm"
    >
      <div className="flex items-start gap-2">
        <span
          {...attributes}
          {...listeners}
          className="mt-0.5 cursor-grab touch-none text-muted-foreground"
          aria-label="Drag to reorder"
        >
          ⠿
        </span>
        <input
          type="checkbox"
          checked={card.isCompleted}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5"
        />
        <span
          className={
            card.isCompleted ? "flex-1 line-through opacity-60" : "flex-1"
          }
        >
          {card.title}
        </span>
        <button
          onClick={onDelete}
          className="text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
          aria-label="Delete card"
        >
          ×
        </button>
      </div>
    </li>
  );
}

function CardPreview({ card }: { card: Card }) {
  return (
    <div className="rounded-md border border-border bg-card p-2 text-sm shadow-lg">
      {card.title}
    </div>
  );
}
