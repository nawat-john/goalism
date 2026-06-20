import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { timelineQuerySchema, type TimelineQuery } from "@study-planner/shared";
import { TimelineService } from "./timeline.service";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller("timeline")
@UseGuards(JwtAuthGuard)
export class TimelineController {
  constructor(private readonly timeline: TimelineService) {}

  @Get()
  get(
    @CurrentUser("userId") userId: string,
    @Query(new ZodValidationPipe(timelineQuerySchema)) query: TimelineQuery,
  ) {
    return this.timeline.get(userId, query);
  }
}
