import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { GoalsModule } from "./goals/goals.module";
import { BoardsModule } from "./boards/boards.module";
import { ColumnsModule } from "./columns/columns.module";
import { CardsModule } from "./cards/cards.module";
import { LabelsModule } from "./labels/labels.module";
import { MilestonesModule } from "./milestones/milestones.module";
import { AiModule } from "./ai/ai.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty" }
            : undefined,
        // Never log the user's BYOK Gemini key or passwords (design §7.3).
        redact: [
          'req.headers["x-user-gemini-key"]',
          'req.headers.authorization',
          'req.body.password',
        ],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    GoalsModule,
    BoardsModule,
    ColumnsModule,
    CardsModule,
    LabelsModule,
    MilestonesModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
