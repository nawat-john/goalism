import { PipeTransform, BadRequestException } from "@nestjs/common";
import { ZodSchema } from "zod";

/**
 * Validates a single argument (body/query/param) against a zod schema from
 * `@study-planner/shared`. zod is the single source of contract (design §7.3),
 * so this pipe — not class-validator — drives request validation.
 *
 * Usage: `@Body(new ZodValidationPipe(loginSchema)) dto: LoginInput`
 *
 * On failure it throws a BadRequestException whose response carries the zod
 * issues; the global exception filter reshapes that into the standard
 * `{ error: { code, message, details } }` envelope.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: result.error.issues,
      });
    }
    return result.data;
  }
}
