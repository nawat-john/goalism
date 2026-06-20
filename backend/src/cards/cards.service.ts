import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateCardInput,
  MoveCardInput,
  UpdateCardInput,
} from "@study-planner/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendPosition } from "../common/position";

@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, columnId: string, dto: CreateCardInput) {
    const column = await this.prisma.boardColumn.findFirst({
      where: { id: columnId, board: { userId } },
      select: { id: true, boardId: true },
    });
    if (!column) {
      throw new NotFoundException({
        code: "COLUMN_NOT_FOUND",
        message: "Column not found",
      });
    }
    if (dto.goalId) await this.ensureGoalOwned(userId, dto.goalId);

    const last = await this.prisma.card.findFirst({
      where: { columnId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    return this.prisma.card.create({
      data: {
        columnId,
        boardId: column.boardId, // denormalized for fast board queries
        goalId: dto.goalId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        position: appendPosition(last?.position ?? null),
      },
    });
  }

  async get(userId: string, id: string) {
    const card = await this.prisma.card.findFirst({
      where: { id, board: { userId } },
      include: { labels: { include: { label: true } } },
    });
    if (!card) throw cardNotFound();
    return card;
  }

  async update(userId: string, id: string, dto: UpdateCardInput) {
    await this.ensureOwned(userId, id);
    if (dto.goalId) await this.ensureGoalOwned(userId, dto.goalId);

    return this.prisma.card.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        goalId: dto.goalId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        // Completing/uncompleting also stamps/clears completedAt.
        ...(dto.isCompleted !== undefined
          ? {
              isCompleted: dto.isCompleted,
              completedAt: dto.isCompleted ? new Date() : null,
            }
          : {}),
      },
    });
  }

  /** Reorder/move a card: target column + fractional position, single-row update. */
  async move(userId: string, id: string, dto: MoveCardInput) {
    await this.ensureOwned(userId, id);
    const column = await this.prisma.boardColumn.findFirst({
      where: { id: dto.columnId, board: { userId } },
      select: { id: true, boardId: true },
    });
    if (!column) {
      throw new NotFoundException({
        code: "COLUMN_NOT_FOUND",
        message: "Column not found",
      });
    }

    return this.prisma.card.update({
      where: { id },
      data: {
        columnId: column.id,
        boardId: column.boardId, // keep denormalized boardId consistent
        position: dto.position,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.card.delete({ where: { id } });
  }

  async attachLabel(userId: string, cardId: string, labelId: string) {
    await this.ensureOwned(userId, cardId);
    await this.ensureLabelOwned(userId, labelId);
    await this.prisma.cardLabel.upsert({
      where: { cardId_labelId: { cardId, labelId } },
      create: { cardId, labelId },
      update: {},
    });
  }

  async detachLabel(userId: string, cardId: string, labelId: string) {
    await this.ensureOwned(userId, cardId);
    await this.prisma.cardLabel.deleteMany({ where: { cardId, labelId } });
  }

  private async ensureOwned(userId: string, id: string) {
    const found = await this.prisma.card.findFirst({
      where: { id, board: { userId } },
      select: { id: true },
    });
    if (!found) throw cardNotFound();
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

  private async ensureLabelOwned(userId: string, labelId: string) {
    const label = await this.prisma.label.findFirst({
      where: { id: labelId, userId },
      select: { id: true },
    });
    if (!label) {
      throw new NotFoundException({
        code: "LABEL_NOT_FOUND",
        message: "Label not found",
      });
    }
  }
}

function cardNotFound() {
  return new NotFoundException({
    code: "CARD_NOT_FOUND",
    message: "Card not found",
  });
}
