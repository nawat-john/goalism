import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateLabelInput,
  UpdateLabelInput,
} from "@study-planner/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Labels are a small per-user set, returned unpaginated and name-ordered. */
  list(userId: string) {
    return this.prisma.label.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });
  }

  create(userId: string, dto: CreateLabelInput) {
    return this.prisma.label.create({
      data: { userId, name: dto.name, color: dto.color },
    });
  }

  async update(userId: string, id: string, dto: UpdateLabelInput) {
    await this.ensureOwned(userId, id);
    return this.prisma.label.update({
      where: { id },
      data: { name: dto.name, color: dto.color },
    });
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.label.delete({ where: { id } });
  }

  private async ensureOwned(userId: string, id: string) {
    const found = await this.prisma.label.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException({
        code: "LABEL_NOT_FOUND",
        message: "Label not found",
      });
    }
  }
}
