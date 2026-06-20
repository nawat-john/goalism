import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { User } from "@study-planner/database";
import type { LoginInput, RegisterInput, User as PublicUser } from "@study-planner/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../common/jwt-auth.guard";

interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

/** Matches the `ms`-style duration the JWT signer accepts for `expiresIn`. */
type JwtDuration = `${number}${"s" | "m" | "h" | "d"}`;

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: RegisterInput, userAgent?: string): Promise<IssuedSession> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException({
        code: "EMAIL_TAKEN",
        message: "An account with this email already exists",
      });
    }
    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      },
    });
    return this.issueSession(user, userAgent);
  }

  async login(input: LoginInput, userAgent?: string): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    // Verify even when the user is missing only if we have a hash; otherwise
    // reject with the same generic message to avoid leaking which emails exist.
    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      });
    }
    return this.issueSession(user, userAgent);
  }

  /** Rotate: validate the presented refresh token, revoke it, issue a fresh pair. */
  async refresh(rawToken: string | undefined, userAgent?: string): Promise<IssuedSession> {
    const { user, jti } = await this.verifyRefreshToken(rawToken);
    await this.prisma.refreshToken.update({
      where: { id: jti },
      data: { revokedAt: new Date() },
    });
    return this.issueSession(user, userAgent);
  }

  /** Revoke the presented refresh token. Idempotent — never throws on a bad token. */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(rawToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
      await this.prisma.refreshToken.updateMany({
        where: { id: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Already-invalid token — nothing to revoke.
    }
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "User no longer exists",
      });
    }
    return toPublicUser(user);
  }

  // ---------- internals ----------

  private async verifyRefreshToken(
    rawToken: string | undefined,
  ): Promise<{ user: User; jti: string }> {
    if (!rawToken) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Missing refresh token",
      });
    }
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(rawToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
    } catch {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Invalid or expired refresh token",
      });
    }

    const row = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: true },
    });
    const valid =
      row &&
      row.revokedAt === null &&
      row.expiresAt > new Date() &&
      (await argon2.verify(row.tokenHash, rawToken));
    if (!valid) {
      throw new UnauthorizedException({
        code: "UNAUTHENTICATED",
        message: "Refresh token is no longer valid",
      });
    }
    return { user: row.user, jti: payload.jti };
  }

  private async issueSession(user: User, userAgent?: string): Promise<IssuedSession> {
    const accessPayload: AccessTokenPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      expiresIn: (this.config.get<string>("JWT_ACCESS_TTL") ?? "15m") as JwtDuration,
    });

    const jti = randomUUID();
    const refreshTtl = this.config.get<string>("JWT_REFRESH_TTL") ?? "30d";
    const refreshExpiresAt = new Date(Date.now() + parseDurationMs(refreshTtl));
    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti };
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      expiresIn: refreshTtl as JwtDuration,
    });
    await this.prisma.refreshToken.create({
      data: {
        id: jti,
        userId: user.id,
        tokenHash: await argon2.hash(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: userAgent?.slice(0, 255),
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshExpiresAt,
      user: toPublicUser(user),
    };
  }
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  };
}

/** Parse JWT-style durations ("15m", "30d", "1h", "45s", or a number of seconds). */
export function parseDurationMs(value: string): number {
  const match = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2] ?? "s";
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * unitMs[unit];
}
