import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AiProxyGenerateInput,
  ApplyPlanInput,
} from "@study-planner/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendPosition } from "../common/position";
import { DEFAULT_COLUMNS } from "../boards/boards.service";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stateless pass-through to Gemini (design §6.2 Mode B). `key` lives only in
   * this call's stack frame — never persisted, never logged (also redacted in
   * the pino config as a defense in depth).
   */
  async proxyGenerate(key: string, dto: AiProxyGenerateInput) {
    const res = await fetch(
      `${GEMINI_BASE_URL}/${dto.model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(dto.payload),
      },
    );
    const body = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;

    if (!res.ok) {
      throw new BadRequestException({
        code: res.status === 429 ? "AI_QUOTA_EXCEEDED" : "AI_UPSTREAM_ERROR",
        message: body?.error?.message ?? "Gemini request failed",
      });
    }
    return body;
  }

  /** Bulk-create cards/milestones from an accepted AI plan, in one transaction (design §6.4). */
  async applyPlan(userId: string, goalId: string, dto: ApplyPlanInput) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });
    if (!goal) throw goalNotFound();

    return this.prisma.$transaction(async (tx) => {
      let board = await tx.board.findFirst({
        where: { goalId, userId },
        orderBy: { position: "asc" },
        include: { columns: { orderBy: { position: "asc" } } },
      });

      if (!board || board.columns.length === 0) {
        const last = await tx.board.findFirst({
          where: { userId },
          orderBy: { position: "desc" },
          select: { position: true },
        });
        const position = appendPosition(last?.position ?? null);

        let columnKey: string | null = null;
        const columns = DEFAULT_COLUMNS.map((title) => {
          columnKey = appendPosition(columnKey);
          return { title, position: columnKey };
        });

        board = await tx.board.create({
          data: {
            userId,
            goalId,
            title: "AI Plan",
            position,
            columns: { create: columns },
          },
          include: { columns: { orderBy: { position: "asc" } } },
        });
      }

      const column = board.columns[0];

      let cursor =
        (
          await tx.card.findFirst({
            where: { columnId: column.id },
            orderBy: { position: "desc" },
            select: { position: true },
          })
        )?.position ?? null;

      const cards = [];
      for (const c of dto.cards) {
        cursor = appendPosition(cursor);
        cards.push(
          await tx.card.create({
            data: {
              columnId: column.id,
              boardId: board.id,
              goalId,
              title: c.title,
              description: c.description,
              priority: c.priority,
              dueDate: c.dueDate ? new Date(c.dueDate) : undefined,
              position: cursor,
            },
          }),
        );
      }

      const milestones = [];
      for (const m of dto.milestones ?? []) {
        milestones.push(
          await tx.milestone.create({
            data: {
              userId,
              goalId,
              title: m.title,
              type: m.type,
              date: new Date(m.date),
            },
          }),
        );
      }

      return { board, cards, milestones };
    });
  }
}

function goalNotFound() {
  return new NotFoundException({
    code: "GOAL_NOT_FOUND",
    message: "Goal not found",
  });
}
