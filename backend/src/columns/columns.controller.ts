import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  createColumnSchema,
  updateColumnSchema,
  uuidSchema,
  type CreateColumnInput,
  type UpdateColumnInput,
} from "@study-planner/shared";
import { ColumnsService } from "./columns.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller()
@UseGuards(JwtAuthGuard)
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Post("boards/:boardId/columns")
  create(
    @CurrentUser("userId") userId: string,
    @Param("boardId", new ZodValidationPipe(uuidSchema)) boardId: string,
    @Body(new ZodValidationPipe(createColumnSchema)) dto: CreateColumnInput,
  ) {
    return this.columns.create(userId, boardId, dto);
  }

  @Patch("columns/:id")
  update(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateColumnSchema)) dto: UpdateColumnInput,
  ) {
    return this.columns.update(userId, id, dto);
  }

  @Delete("columns/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.columns.remove(userId, id);
  }
}
