import { Injectable } from "@nestjs/common";
import type { TimelineQuery } from "@study-planner/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  /** Combine milestones + cards with a due date in range (design §7.2). */
  async get(userId: string, query: TimelineQuery) {
    const range = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const hasRange = Object.keys(range).length > 0;

    const [milestones, cards] = await Promise.all([
      this.prisma.milestone.findMany({
        where: {
          userId,
          ...(query.goalId ? { goalId: query.goalId } : {}),
          ...(hasRange ? { date: range } : {}),
        },
        orderBy: { date: "asc" },
      }),
      this.prisma.card.findMany({
        where: {
          board: { userId },
          dueDate: { not: null, ...range },
          ...(query.goalId ? { goalId: query.goalId } : {}),
        },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    return { milestones, cards };
  }
}
