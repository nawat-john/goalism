import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "@study-planner/shared";
import { AuthService, IssuedSession, parseDurationMs } from "./auth.service";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/v1/auth";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register(dto, req.headers["user-agent"]);
    return this.respondWithSession(res, session);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(dto, req.headers["user-agent"]);
    return this.respondWithSession(res, session);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = readRefreshCookie(req);
    const session = await this.auth.refresh(token, req.headers["user-agent"]);
    return this.respondWithSession(res, session);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser("userId") userId: string) {
    return this.auth.me(userId);
  }

  /** Set the rotated refresh cookie and return the access token + public user. */
  private respondWithSession(res: Response, session: IssuedSession) {
    const isProd = this.config.get<string>("NODE_ENV") === "production";
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: REFRESH_COOKIE_PATH,
      maxAge: parseDurationMs(
        this.config.get<string>("JWT_REFRESH_TTL") ?? "30d",
      ),
    });
    return { accessToken: session.accessToken, user: session.user };
  }
}

function readRefreshCookie(req: Request): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
}
