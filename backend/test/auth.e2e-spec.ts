import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AuthModule } from "../src/auth/auth.module";
import { AuthService } from "../src/auth/auth.service";
import { AllExceptionsFilter } from "../src/common/http-exception.filter";

/**
 * Controller-level wiring test (no DB): exercises the zod validation pipe, the
 * standard error envelope, the JWT guard, and refresh-cookie handling, with a
 * stubbed AuthService. Full DB-backed integration runs against real Postgres in CI.
 */
const SESSION = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  refreshExpiresAt: new Date(Date.now() + 86_400_000),
  user: {
    id: "11111111-1111-1111-1111-111111111111",
    email: "demo@studyplanner.dev",
    displayName: "Demo",
    avatarUrl: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
};

describe("Auth endpoints (e2e)", () => {
  let app: INestApplication;
  const authService = {
    register: jest.fn().mockResolvedValue(SESSION),
    login: jest.fn().mockResolvedValue(SESSION),
    refresh: jest.fn().mockResolvedValue(SESSION),
    logout: jest.fn().mockResolvedValue(undefined),
    me: jest.fn().mockResolvedValue(SESSION.user),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_ACCESS_SECRET: "test-access",
              JWT_REFRESH_SECRET: "test-refresh",
              JWT_ACCESS_TTL: "15m",
              JWT_REFRESH_TTL: "30d",
            }),
          ],
        }),
        AuthModule,
      ],
    })
      .overrideProvider(AuthService)
      .useValue(authService)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects an invalid login body with the standard error envelope", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "not-an-email", password: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it("logs in, returns the access token + user, and sets an httpOnly refresh cookie", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "demo@studyplanner.dev", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      accessToken: SESSION.accessToken,
      user: SESSION.user,
    });
    // Refresh token rides in an httpOnly cookie, never in the JSON body.
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toContain("refresh_token=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/v1/auth");
  });

  it("requires a bearer token for /auth/me", async () => {
    const res = await request(app.getHttpServer()).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});
