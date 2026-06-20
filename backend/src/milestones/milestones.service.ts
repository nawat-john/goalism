import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from "@study-planner/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MilestonesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateMilestoneInput) {
    if (dto.goalId) await this.ensureGoalOwned(userId, dto.goalId);
    return this.prisma.milestone.create({
      data: {
        userId,
        goalId: dto.goalId,
        title: dto.title,
        type: dto.type,
        date: new Date(dto.date),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateMilestoneInput) {
    await this.ensureOwned(userId, id);
    if (dto.goalId) await this.ensureGoalOwned(userId, dto.goalId);

    return this.prisma.milestone.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        goalId: dto.goalId,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.milestone.delete({ where: { id } });
  }

  private async ensureOwned(userId: string, id: string) {
    const found = await this.prisma.milestone.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) throw milestoneNotFound();
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

function milestoneNotFound() {
  return new NotFoundException({
    code: "MILESTONE_NOT_FOUND",
    message: "Milestone not found",
  });
}
