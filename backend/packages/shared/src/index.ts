import { z } from "zod";

/**
 * Single source of truth for the FE/BE contract.
 * These zod schemas validate on the NestJS backend and infer types on the
 * Next.js frontend. Defined here once — never duplicate these shapes in an app.
 */

// ---------- Enums ----------
export const goalStatusSchema = z.enum([
  "active",
  "achieved",
  "on_hold",
  "archived",
]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const cardPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type CardPriority = z.infer<typeof cardPrioritySchema>;

export const milestoneTypeSchema = z.enum(["milestone", "deadline", "event"]);
export type MilestoneType = z.infer<typeof milestoneTypeSchema>;

// ---------- Common ----------
export const uuidSchema = z.string().uuid();

/** Fractional/lexicographic rank string (LexoRank-style), not a sequential int. */
export const positionSchema = z.string().min(1);

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Consistent error envelope returned by the API. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// ---------- Auth ----------
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof userSchema>;

// ---------- Goal ----------
export const goalSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  status: goalStatusSchema,
  targetDate: z.string().nullable(),
  progress: z.number().int().min(0).max(100),
  color: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Goal = z.infer<typeof goalSchema>;

export const createGoalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  targetDate: z.string().date().optional(),
  color: z.string().optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = createGoalSchema
  .extend({
    status: goalStatusSchema,
    progress: z.number().int().min(0).max(100),
  })
  .partial();
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

// ---------- Board ----------
export const boardSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  goalId: uuidSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  position: positionSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Board = z.infer<typeof boardSchema>;

export const createBoardSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  goalId: uuidSchema.optional(),
});
export type CreateBoardInput = z.infer<typeof createBoardSchema>;

export const updateBoardSchema = createBoardSchema.partial();
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

// ---------- Column ----------
export const columnSchema = z.object({
  id: uuidSchema,
  boardId: uuidSchema,
  title: z.string(),
  position: positionSchema,
  wipLimit: z.number().int().positive().nullable(),
});
export type Column = z.infer<typeof columnSchema>;

export const createColumnSchema = z.object({
  title: z.string().min(1).max(120),
  wipLimit: z.number().int().positive().optional(),
});
export type CreateColumnInput = z.infer<typeof createColumnSchema>;

export const updateColumnSchema = z
  .object({
    title: z.string().min(1).max(120),
    wipLimit: z.number().int().positive().nullable(),
    position: positionSchema,
  })
  .partial();
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;

// ---------- Card ----------
export const cardSchema = z.object({
  id: uuidSchema,
  columnId: uuidSchema,
  boardId: uuidSchema,
  goalId: uuidSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  position: positionSchema,
  startDate: z.string().datetime().nullable(),
  dueDate: z.string().datetime().nullable(),
  priority: cardPrioritySchema,
  isCompleted: z.boolean(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Card = z.infer<typeof cardSchema>;

export const createCardSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  priority: cardPrioritySchema.optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  goalId: uuidSchema.optional(),
});
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const updateCardSchema = createCardSchema
  .extend({ isCompleted: z.boolean() })
  .partial();
export type UpdateCardInput = z.infer<typeof updateCardSchema>;

/** Move/reorder a card: target column + new fractional position. */
export const moveCardSchema = z.object({
  columnId: uuidSchema,
  position: positionSchema,
});
export type MoveCardInput = z.infer<typeof moveCardSchema>;

// ---------- Label ----------
export const labelSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  name: z.string(),
  color: z.string(),
});
export type Label = z.infer<typeof labelSchema>;

export const createLabelSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().min(1).max(20),
});
export type CreateLabelInput = z.infer<typeof createLabelSchema>;

export const updateLabelSchema = createLabelSchema.partial();
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;

// ---------- Milestone ----------
export const milestoneSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  goalId: uuidSchema.nullable(),
  title: z.string(),
  type: milestoneTypeSchema,
  date: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const createMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  type: milestoneTypeSchema.optional(),
  date: z.string().datetime(),
  goalId: uuidSchema.optional(),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = createMilestoneSchema.partial();
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;

export const timelineQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  goalId: uuidSchema.optional(),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

// ---------- AI (BYOK Gemini) ----------
export const planRequestSchema = z.object({
  goalTitle: z.string().min(1),
  context: z.string().optional(),
  model: z.string().default("gemini-2.5-flash"),
});
export type PlanRequest = z.infer<typeof planRequestSchema>;

export const planCardSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  priority: cardPrioritySchema.optional(),
});
export type PlanCard = z.infer<typeof planCardSchema>;

/** Shape the model must return (responseMimeType=application/json), validated before display. */
export const planSuggestionSchema = z.object({
  summary: z.string(),
  cards: z.array(planCardSchema),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1),
        type: milestoneTypeSchema.optional(),
        date: z.string(),
      }),
    )
    .optional(),
});
export type PlanSuggestion = z.infer<typeof planSuggestionSchema>;

/** Body for POST /goals/:id/apply-plan — persisted via normal endpoint after user accepts. */
export const applyPlanSchema = z.object({
  cards: z.array(planCardSchema),
  milestones: planSuggestionSchema.shape.milestones,
});
export type ApplyPlanInput = z.infer<typeof applyPlanSchema>;

/**
 * Body for POST /ai/proxy/generate (Mode B thin proxy, design §6.2). The key
 * itself travels in the `x-user-gemini-key` header, never the body; `payload`
 * is forwarded to Gemini's generateContent body as-is.
 */
export const aiProxyGenerateSchema = z.object({
  model: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});
export type AiProxyGenerateInput = z.infer<typeof aiProxyGenerateSchema>;
