import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateGoalInput,
  GoalStatus,
  UpdateGoalInput,
} from "@study-planner/shared";
import { PrismaService } from "../prisma/prisma.service";
import { pageArgs, toPage } from "../common/pagination";

interface ListParams {
  status?: GoalStatus;
  limit: number;
  cursor?: string;
}

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, params: ListParams) {
    const rows = await this.prisma.goal.findMany({
      where: { userId, ...(params.status ? { status: params.status } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...pageArgs(params.limit, params.cursor),
    });
    return toPage(rows, params.limit);
  }

  create(userId: string, dto: CreateGoalInput) {
    return this.prisma.goal.create({
      data: {
        userId,
        title: dto.title,
        description: dto.description,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        color: dto.color,
      },
    });
  }

  /** Goal with its linked boards and milestones (design §7.2). */
  async get(userId: string, id: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
      include: {
        boards: { orderBy: { position: "asc" } },
        milestones: { orderBy: { date: "asc" } },
      },
    });
    if (!goal) throw goalNotFound();
    return goal;
  }

  async update(userId: string, id: string, dto: UpdateGoalInput) {
    await this.ensureOwned(userId, id);
    return this.prisma.goal.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        color: dto.color,
        status: dto.status,
        progress: dto.progress,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.goal.delete({ where: { id } });
  }

  private async ensureOwned(userId: string, id: string) {
    const found = await this.prisma.goal.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) throw goalNotFound();
  }
}

function goalNotFound() {
  return new NotFoundException({
    code: "GOAL_NOT_FOUND",
    message: "Goal not found",
  });
}
