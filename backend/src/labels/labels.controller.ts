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
  createLabelSchema,
  updateLabelSchema,
  uuidSchema,
  type CreateLabelInput,
  type UpdateLabelInput,
} from "@study-planner/shared";
import { LabelsService } from "./labels.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller("labels")
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Get()
  list(@CurrentUser("userId") userId: string) {
    return this.labels.list(userId);
  }

  @Post()
  create(
    @CurrentUser("userId") userId: string,
    @Body(new ZodValidationPipe(createLabelSchema)) dto: CreateLabelInput,
  ) {
    return this.labels.create(userId, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateLabelSchema)) dto: UpdateLabelInput,
  ) {
    return this.labels.update(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.labels.remove(userId, id);
  }
}
