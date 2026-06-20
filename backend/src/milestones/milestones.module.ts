import { Module } from "@nestjs/common";
import { MilestonesController } from "./milestones.controller";
import { MilestonesService } from "./milestones.service";
import { TimelineController } from "./timeline.controller";
import { TimelineService } from "./timeline.service";

@Module({
  controllers: [MilestonesController, TimelineController],
  providers: [MilestonesService, TimelineService],
})
export class MilestonesModule {}
