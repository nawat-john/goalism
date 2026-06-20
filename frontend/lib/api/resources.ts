import type {
  ApplyPlanInput,
  Board,
  Card,
  Column,
  CreateBoardInput,
  CreateCardInput,
  CreateColumnInput,
  CreateGoalInput,
  CreateLabelInput,
  CreateMilestoneInput,
  Goal,
  GoalStatus,
  Label,
  Milestone,
  MoveCardInput,
  TimelineQuery,
  UpdateCardInput,
  UpdateGoalInput,
  UpdateMilestoneInput,
} from "@study-planner/shared";
import { apiFetch } from "./client";

/** Cursor-paginated list envelope returned by the API list endpoints. */
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export type GoalWithRelations = Goal & {
  boards: Board[];
  milestones: Milestone[];
};

export type ColumnWithCards = Column & { cards: Card[] };
export type BoardWithColumns = Board & { columns: ColumnWithCards[] };

/**
 * Apply a card move to a cached board: removes the card from its source
 * column and inserts it (sorted by `position`) into the destination column.
 * Used for the optimistic update on drag-end so the UI doesn't wait on the
 * round trip to the server.
 */
export function applyCardMove(
  board: BoardWithColumns,
  cardId: string,
  move: MoveCardInput,
): BoardWithColumns {
  let moved: Card | undefined;
  const withoutCard = board.columns.map((column) => {
    const card = column.cards.find((c) => c.id === cardId);
    if (!card) return column;
    moved = card;
    return { ...column, cards: column.cards.filter((c) => c.id !== cardId) };
  });
  if (!moved) return board;

  const updatedCard: Card = {
    ...moved,
    columnId: move.columnId,
    boardId: board.id,
    position: move.position,
  };

  return {
    ...board,
    columns: withoutCard.map((column) => {
      if (column.id !== move.columnId) return column;
      const cards = [...column.cards, updatedCard].sort((a, b) =>
        a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
      );
      return { ...column, cards };
    }),
  };
}

const qs = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(([, v]) => v != null);
  return entries.length ? `?${new URLSearchParams(entries as [string, string][])}` : "";
};

export const goalsApi = {
  list: (params: { status?: GoalStatus; cursor?: string } = {}) =>
    apiFetch<Page<Goal>>(`/goals${qs(params)}`),
  get: (id: string) => apiFetch<GoalWithRelations>(`/goals/${id}`),
  create: (input: CreateGoalInput) =>
    apiFetch<Goal>("/goals", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: UpdateGoalInput) =>
    apiFetch<Goal>(`/goals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => apiFetch<void>(`/goals/${id}`, { method: "DELETE" }),
};

export const boardsApi = {
  list: (params: { goalId?: string; cursor?: string } = {}) =>
    apiFetch<Page<Board>>(`/boards${qs(params)}`),
  get: (id: string) => apiFetch<BoardWithColumns>(`/boards/${id}`),
  create: (input: CreateBoardInput) =>
    apiFetch<BoardWithColumns>("/boards", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => apiFetch<void>(`/boards/${id}`, { method: "DELETE" }),
};

export const columnsApi = {
  create: (boardId: string, input: CreateColumnInput) =>
    apiFetch<Column>(`/boards/${boardId}/columns`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => apiFetch<void>(`/columns/${id}`, { method: "DELETE" }),
};

export const cardsApi = {
  create: (columnId: string, input: CreateCardInput) =>
    apiFetch<Card>(`/columns/${columnId}/cards`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateCardInput) =>
    apiFetch<Card>(`/cards/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  move: (id: string, input: MoveCardInput) =>
    apiFetch<Card>(`/cards/${id}/move`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => apiFetch<void>(`/cards/${id}`, { method: "DELETE" }),
};

export const labelsApi = {
  list: () => apiFetch<Label[]>("/labels"),
  create: (input: CreateLabelInput) =>
    apiFetch<Label>("/labels", { method: "POST", body: JSON.stringify(input) }),
  remove: (id: string) => apiFetch<void>(`/labels/${id}`, { method: "DELETE" }),
};

export const milestonesApi = {
  create: (input: CreateMilestoneInput) =>
    apiFetch<Milestone>("/milestones", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateMilestoneInput) =>
    apiFetch<Milestone>(`/milestones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => apiFetch<void>(`/milestones/${id}`, { method: "DELETE" }),
};

export interface TimelineResponse {
  milestones: Milestone[];
  cards: Card[];
}

export const timelineApi = {
  get: (params: TimelineQuery = {}) =>
    apiFetch<TimelineResponse>(`/timeline${qs(params)}`),
};

export interface ApplyPlanResult {
  board: Board;
  cards: Card[];
  milestones: Milestone[];
}

export const aiApi = {
  applyPlan: (goalId: string, input: ApplyPlanInput) =>
    apiFetch<ApplyPlanResult>(`/goals/${goalId}/apply-plan`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
