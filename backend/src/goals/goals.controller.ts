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
  applyPlanSchema,
  createGoalSchema,
  goalStatusSchema,
  paginationQuerySchema,
  updateGoalSchema,
  uuidSchema,
  type ApplyPlanInput,
  type CreateGoalInput,
  type UpdateGoalInput,
} from "@study-planner/shared";
import { z } from "zod";
import { GoalsService } from "./goals.service";
import { AiService } from "../ai/ai.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

const listQuerySchema = paginationQuerySchema.extend({
  status: goalStatusSchema.optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller("goals")
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(
    private readonly goals: GoalsService,
    private readonly ai: AiService,
  ) {}

  @Get()
  list(
    @CurrentUser("userId") userId: string,
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ) {
    return this.goals.list(userId, query);
  }

  @Post()
  create(
    @CurrentUser("userId") userId: string,
    @Body(new ZodValidationPipe(createGoalSchema)) dto: CreateGoalInput,
  ) {
    return this.goals.create(userId, dto);
  }

  @Get(":id")
  get(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.goals.get(userId, id);
  }

  @Patch(":id")
  update(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateGoalSchema)) dto: UpdateGoalInput,
  ) {
    return this.goals.update(userId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
  ) {
    return this.goals.remove(userId, id);
  }

  /** Persist an AI-proposed plan the user has reviewed and accepted (design §6.4). */
  @Post(":id/apply-plan")
  applyPlan(
    @CurrentUser("userId") userId: string,
    @Param("id", new ZodValidationPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(applyPlanSchema)) dto: ApplyPlanInput,
  ) {
    return this.ai.applyPlan(userId, id, dto);
  }
}
