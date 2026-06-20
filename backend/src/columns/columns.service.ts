import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateColumnInput,
  UpdateColumnInput,
} from "@study-planner/shared";
import { PrismaService } from "../prisma/prisma.service";
import { appendPosition } from "../common/position";

@Injectable()
export class ColumnsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, boardId: string, dto: CreateColumnInput) {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, userId },
      select: { id: true },
    });
    if (!board) {
      throw new NotFoundException({
        code: "BOARD_NOT_FOUND",
        message: "Board not found",
      });
    }

    const last = await this.prisma.boardColumn.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    return this.prisma.boardColumn.create({
      data: {
        boardId,
        title: dto.title,
        wipLimit: dto.wipLimit,
        position: appendPosition(last?.position ?? null),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateColumnInput) {
    await this.ensureOwned(userId, id);
    return this.prisma.boardColumn.update({
      where: { id },
      data: {
        title: dto.title,
        wipLimit: dto.wipLimit,
        position: dto.position,
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.boardColumn.delete({ where: { id } });
  }

  /** A column is owned transitively through its board's `userId`. */
  private async ensureOwned(userId: string, id: string) {
    const found = await this.prisma.boardColumn.findFirst({
      where: { id, board: { userId } },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: "COLUMN_NOT_FOUND",
        message: "Column not found",
      });
    }
  }
}
