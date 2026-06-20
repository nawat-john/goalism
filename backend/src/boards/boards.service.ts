import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CreateBoardInput, UpdateBoardInput } from "@study-planner/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendPosition } from "../common/position";
import { pageArgs, toPage } from "../common/pagination";

interface ListParams {
  goalId?: string;
  limit: number;
  cursor?: string;
}

export const DEFAULT_COLUMNS = ["To do", "In progress", "Done"];

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, params: ListParams) {
    const rows = await this.prisma.board.findMany({
      where: { userId, ...(params.goalId ? { goalId: params.goalId } : {}) },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      ...pageArgs(params.limit, params.cursor),
    });
    return toPage(rows, params.limit);
  }

  /** Create a board (appended after the user's last) seeded with default columns. */
  async create(userId: string, dto: CreateBoardInput) {
    if (dto.goalId) await this.ensureGoalOwned(userId, dto.goalId);

    const last = await this.prisma.board.findFirst({
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

    return this.prisma.board.create({
      data: {
        userId,
        goalId: dto.goalId,
        title: dto.title,
        description: dto.description,
        position,
        columns: { create: columns },
      },
      include: { columns: { orderBy: { position: "asc" } } },
    });
  }

  /** Board with columns and their cards, fully ordered (design §7.2). */
  async get(userId: string, id: string) {
    const board = await this.prisma.board.findFirst({
      where: { id, userId },
      include: {
        columns: {
          orderBy: { position: "asc" },
          include: { cards: { orderBy: { position: "asc" } } },
        },
      },
    });
    if (!board) throw boardNotFound();
    return board;
  }

  async update(userId: string, id: string, dto: UpdateBoardInput) {
    await this.ensureOwned(userId, id);
    if (dto.goalId) await this.ensureGoalOwned(userId, dto.goalId);
    return this.prisma.board.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        goalId: dto.goalId,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.board.delete({ where: { id } });
  }

  private async ensureOwned(userId: string, id: string) {
    const found = await this.prisma.board.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) throw boardNotFound();
  }

  private async ensureGoalOwned(userId: string, goalId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });
    if (!goal) {
      throw new ForbiddenException({
        code: "GOAL_NOT_FOUND",
        message: "Goal not found or not yours",
      });
    }
  }
}

function boardNotFound() {
  return new NotFoundException({
    code: "BOARD_NOT_FOUND",
    message: "Board not found",
  });
}
