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
  createMilestoneSchema,
  updateMilestoneSchema,
  uuidSchema,
  type CreateMilestoneInput,
  type UpdateMilestoneInput,
} from "@study-planner/shared";
import { MilestonesService } from "./milestones.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller("milestones")
@UseGuards(JwtAuthGuard)
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @Post()
  create(
    @CurrentUser("userId") userId: string,
    @Body(new ZodValidationPipe(createMilestoneSchema)) dto: CreateMilestoneInput,
  ) {
    return this.milestones.create(userId, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateMilestoneSchema)) dto: UpdateMilestoneInput,
  ) {
    return this.milestones.update(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.milestones.remove(userId, id);
  }
}
