"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  ApplyPlanInput,
  CreateBoardInput,
  CreateCardInput,
  CreateColumnInput,
  CreateGoalInput,
  CreateLabelInput,
  CreateMilestoneInput,
  MoveCardInput,
  TimelineQuery,
  UpdateCardInput,
  UpdateGoalInput,
  UpdateMilestoneInput,
} from "@study-planner/shared";
import {
  aiApi,
  applyCardMove,
  boardsApi,
  cardsApi,
  columnsApi,
  goalsApi,
  labelsApi,
  milestonesApi,
  timelineApi,
  type BoardWithColumns,
} from "./resources";

export const queryKeys = {
  goals: ["goals"] as const,
  goal: (id: string) => ["goals", id] as const,
  board: (id: string) => ["boards", id] as const,
  labels: ["labels"] as const,
  timeline: (query: TimelineQuery) => ["timeline", query] as const,
};

// ---------- Goals ----------
export function useGoals() {
  return useQuery({
    queryKey: queryKeys.goals,
    queryFn: () => goalsApi.list(),
  });
}

export function useGoal(id: string) {
  return useQuery({
    queryKey: queryKeys.goal(id),
    queryFn: () => goalsApi.get(id),
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) => goalsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.goals }),
  });
}

export function useUpdateGoal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGoalInput) => goalsApi.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.goals });
      void qc.invalidateQueries({ queryKey: queryKeys.goal(id) });
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => goalsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.goals }),
  });
}

// ---------- Boards ----------
export function useBoard(id: string) {
  return useQuery({
    queryKey: queryKeys.board(id),
    queryFn: () => boardsApi.get(id),
  });
}

export function useCreateBoard(goalId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBoardInput) => boardsApi.create(input),
    onSuccess: () => {
      if (goalId) void qc.invalidateQueries({ queryKey: queryKeys.goal(goalId) });
    },
  });
}

// ---------- Columns ----------
export function useCreateColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateColumnInput) =>
      columnsApi.create(boardId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

// ---------- Cards ----------
export function useCreateCard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      columnId,
      input,
    }: {
      columnId: string;
      input: CreateCardInput;
    }) => cardsApi.create(columnId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

export function useUpdateCard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCardInput }) =>
      cardsApi.update(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

/** Drag-and-drop reorder/move: optimistic cache update, rollback on failure. */
export function useMoveCard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MoveCardInput }) =>
      cardsApi.move(id, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: queryKeys.board(boardId) });
      const previous = qc.getQueryData<BoardWithColumns>(
        queryKeys.board(boardId),
      );
      if (previous) {
        qc.setQueryData<BoardWithColumns>(
          queryKeys.board(boardId),
          applyCardMove(previous, id, input),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.board(boardId), context.previous);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

export function useDeleteCard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cardsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.board(boardId) }),
  });
}

// ---------- Labels ----------
export function useLabels() {
  return useQuery({ queryKey: queryKeys.labels, queryFn: () => labelsApi.list() });
}

export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLabelInput) => labelsApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.labels }),
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => labelsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.labels }),
  });
}

// ---------- Timeline + milestones ----------
export function useTimeline(query: TimelineQuery) {
  return useQuery({
    queryKey: queryKeys.timeline(query),
    queryFn: () => timelineApi.get(query),
  });
}

function invalidateTimelineAndGoal(qc: ReturnType<typeof useQueryClient>, goalId?: string) {
  void qc.invalidateQueries({ queryKey: ["timeline"] });
  if (goalId) void qc.invalidateQueries({ queryKey: queryKeys.goal(goalId) });
}

export function useCreateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMilestoneInput) => milestonesApi.create(input),
    onSuccess: (milestone) => invalidateTimelineAndGoal(qc, milestone.goalId ?? undefined),
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateMilestoneInput }) =>
      milestonesApi.update(id, input),
    onSuccess: (milestone) => invalidateTimelineAndGoal(qc, milestone.goalId ?? undefined),
  });
}

export function useDeleteMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => milestonesApi.remove(id),
    onSuccess: () => invalidateTimelineAndGoal(qc),
  });
}

// ---------- AI assistant ----------
/** Persist an AI-proposed plan the user has reviewed and accepted (design §6.4). */
export function useApplyPlan(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyPlanInput) => aiApi.applyPlan(goalId, input),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: queryKeys.goal(goalId) });
      void qc.invalidateQueries({ queryKey: queryKeys.board(result.board.id) });
      void qc.invalidateQueries({ queryKey: ["timeline"] });
    },
  });
}
