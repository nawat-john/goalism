import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthedRequest, AuthUser } from "./jwt-auth.guard";

/**
 * Injects the authenticated principal set by {@link JwtAuthGuard}.
 * Only valid on routes protected by the guard.
 *
 * Usage: `@CurrentUser() user: AuthUser` or `@CurrentUser('userId') id: string`
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    return data && user ? user[data] : user;
  },
);
