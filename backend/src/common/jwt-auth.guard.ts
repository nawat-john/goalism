import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

/** Payload carried by the short-lived access token. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
}

/** The principal attached to the request after a successful guard pass. */
export interface AuthUser {
  userId: string;
  email: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

/**
 * Verifies the Bearer access token (in-memory on the client) and attaches
 * `req.user`. Every resource controller scopes by `req.user.userId` to guard
 * against IDOR (design §7.2). Refresh tokens are never accepted here — they
 * live in an httpOnly cookie and only the `/auth/refresh` route reads them.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = extractBearer(req);
    if (!token) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Missing access token",
      });
    }
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      req.user = { userId: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Invalid or expired access token",
      });
    }
  }
}

function extractBearer(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  return scheme === "Bearer" && value ? value : undefined;
}
