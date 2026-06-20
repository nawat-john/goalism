import { initSentry } from "./sentry";
initSentry();

import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/http-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  // Validation is driven per-route by ZodValidationPipe (schemas from
  // @study-planner/shared); the filter shapes all errors into the standard envelope.
  app.useGlobalFilters(new AllExceptionsFilter());

  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());
  app.enableCors({ origin: origins, credentials: true });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
