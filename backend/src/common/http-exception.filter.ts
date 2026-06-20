import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import * as Sentry from "@sentry/node";

/** Standard error envelope (design §7.3): `{ error: { code, message, details } }`. */
interface ErrorBody {
  code: string;
  message: string;
  details?: unknown[];
}

/**
 * Catches every thrown error and serialises it to the consistent envelope.
 * HttpExceptions whose payload already contains a `code` (e.g. from
 * ZodValidationPipe) keep that code; otherwise the HTTP status name is used.
 * Unknown errors collapse to a 500 with no internals leaked to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorBody = {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === "string") {
        body = { code: statusToCode(status), message: payload };
      } else if (typeof payload === "object" && payload !== null) {
        const p = payload as Record<string, unknown>;
        body = {
          code: typeof p.code === "string" ? p.code : statusToCode(status),
          message:
            typeof p.message === "string"
              ? p.message
              : Array.isArray(p.message)
                ? p.message.join(", ")
                : exception.message,
          details: Array.isArray(p.details)
            ? (p.details as unknown[])
            : undefined,
        };
      }
    } else {
      // Non-HTTP errors are unexpected — log the real cause, hide it from clients.
      this.logger.error(exception);
      Sentry.captureException(exception);
    }

    res.status(status).json({ error: body });
  }
}

function statusToCode(status: number): string {
  return (
    HttpStatus[status]?.toString().replace(/\s+/g, "_") ??
    `HTTP_${status}`
  );
}
