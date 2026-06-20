import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  createBoardSchema,
  paginationQuerySchema,
  updateBoardSchema,
  uuidSchema,
  type CreateBoardInput,
  type UpdateBoardInput,
} from "@study-planner/shared";
import { z } from "zod";
import { BoardsService } from "./boards.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

const listQuerySchema = paginationQuerySchema.extend({
  goalId: uuidSchema.optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller("boards")
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  list(
    @CurrentUser("userId") userId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.boards.list(userId, query);
  }

  @Post()
  create(
    @CurrentUser("userId") userId: string,
    @Body(new ZodValidationPipe(createBoardSchema)) dto: CreateBoardInput,
  ) {
    return this.boards.create(userId, dto);
  }

  @Get(":id")
  get(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.boards.get(userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateBoardSchema)) dto: UpdateBoardInput,
  ) {
    return this.boards.update(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.boards.remove(userId, id);
  }
}
