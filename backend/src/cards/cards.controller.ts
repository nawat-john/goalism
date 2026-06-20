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
  UseGuards,
} from "@nestjs/common";
import {
  createCardSchema,
  moveCardSchema,
  updateCardSchema,
  uuidSchema,
  type CreateCardInput,
  type MoveCardInput,
  type UpdateCardInput,
} from "@study-planner/shared";
import { CardsService } from "./cards.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller()
@UseGuards(JwtAuthGuard)
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Post("columns/:columnId/cards")
  create(
    @CurrentUser("userId") userId: string,
    @Param("columnId", new ZodValidationPipe(uuidSchema)) columnId: string,
    @Body(new ZodValidationPipe(createCardSchema)) dto: CreateCardInput,
  ) {
    return this.cards.create(userId, columnId, dto);
  }

  @Get("cards/:id")
  get(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.cards.get(userId, id);
  }

  @Patch("cards/:id")
  update(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateCardSchema)) dto: UpdateCardInput,
  ) {
    return this.cards.update(userId, id, dto);
  }

  @Patch("cards/:id/move")
  move(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(moveCardSchema)) dto: MoveCardInput,
  ) {
    return this.cards.move(userId, id, dto);
  }

  @Delete("cards/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.cards.remove(userId, id);
  }

  @Post("cards/:id/labels/:labelId")
  @HttpCode(HttpStatus.NO_CONTENT)
  attachLabel(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Param("labelId", new ZodValidationPipe(uuidSchema)) labelId: string,
  ) {
    return this.cards.attachLabel(userId, id, labelId);
  }

  @Delete("cards/:id/labels/:labelId")
  @HttpCode(HttpStatus.NO_CONTENT)
  detachLabel(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Param("labelId", new ZodValidationPipe(uuidSchema)) labelId: string,
  ) {
    return this.cards.detachLabel(userId, id, labelId);
  }
}
