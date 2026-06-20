import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { AuthService, parseDurationMs } from "./auth.service";

const ENV: Record<string, string> = {
  JWT_ACCESS_SECRET: "test-access",
  JWT_REFRESH_SECRET: "test-refresh",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "30d",
};

function makeConfig() {
  return {
    get: (key: string) => ENV[key],
    getOrThrow: (key: string) => {
      const v = ENV[key];
      if (v === undefined) throw new Error(`missing ${key}`);
      return v;
    },
  };
}

function makePrismaMock() {
  return {
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

type PrismaMock = ReturnType<typeof makePrismaMock>;

function buildUser(passwordHash: string) {
  return {
    id: "user-1",
    email: "demo@studyplanner.dev",
    passwordHash,
    displayName: "Demo",
    avatarUrl: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("parseDurationMs", () => {
  it("parses ms-style durations", () => {
    expect(parseDurationMs("45s")).toBe(45_000);
    expect(parseDurationMs("15m")).toBe(900_000);
    expect(parseDurationMs("1h")).toBe(3_600_000);
    expect(parseDurationMs("30d")).toBe(2_592_000_000);
    expect(parseDurationMs("60")).toBe(60_000); // bare number = seconds
  });

  it("rejects garbage", () => {
    expect(() => parseDurationMs("soon")).toThrow();
  });
});

describe("AuthService", () => {
  let prisma: PrismaMock;
  let jwt: JwtService;
  let service: AuthService;

  beforeEach(() => {
    prisma = makePrismaMock();
    jwt = new JwtService({});
    service = new AuthService(
      prisma as never,
      jwt,
      makeConfig() as never,
    );
  });

  describe("register", () => {
    it("rejects a duplicate email", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser("x"));
      await expect(
        service.register({
          email: "demo@studyplanner.dev",
          password: "password123",
          displayName: "Demo",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("hashes the password and issues a session", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: { passwordHash: string } }) =>
        Promise.resolve(buildUser(data.passwordHash)),
      );
      prisma.refreshToken.create.mockResolvedValue({});

      const session = await service.register({
        email: "demo@studyplanner.dev",
        password: "password123",
        displayName: "Demo",
      });

      // Stored hash must not be the plaintext password.
      const created = prisma.user.create.mock.calls[0][0] as {
        data: { passwordHash: string };
      };
      expect(created.data.passwordHash).not.toBe("password123");
      expect(await argon2.verify(created.data.passwordHash, "password123")).toBe(
        true,
      );

      // Access token verifies and carries the user id; no passwordHash leaks out.
      const payload = await jwt.verifyAsync(session.accessToken, {
        secret: ENV.JWT_ACCESS_SECRET,
      });
      expect(payload.sub).toBe("user-1");
      expect(session.user).not.toHaveProperty("passwordHash");
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("login", () => {
    it("rejects an unknown email without leaking which", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: "nope@x.dev", password: "password123" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects a wrong password", async () => {
      const hash = await argon2.hash("password123");
      prisma.user.findUnique.mockResolvedValue(buildUser(hash));
      await expect(
        service.login({ email: "demo@studyplanner.dev", password: "wrong" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("issues a session on correct credentials", async () => {
      const hash = await argon2.hash("password123");
      prisma.user.findUnique.mockResolvedValue(buildUser(hash));
      prisma.refreshToken.create.mockResolvedValue({});
      const session = await service.login({
        email: "demo@studyplanner.dev",
        password: "password123",
      });
      expect(session.accessToken).toBeTruthy();
      expect(session.refreshToken).toBeTruthy();
    });
  });

  describe("refresh", () => {
    it("rotates the token: revokes the old row and issues a new one", async () => {
      // 1. Mint a real refresh token via login.
      const hash = await argon2.hash("password123");
      const user = buildUser(hash);
      prisma.user.findUnique.mockResolvedValue(user);
      let storedHash = "";
      prisma.refreshToken.create.mockImplementation(
        ({ data }: { data: { tokenHash: string } }) => {
          storedHash = data.tokenHash;
          return Promise.resolve({});
        },
      );
      const first = await service.login({
        email: "demo@studyplanner.dev",
        password: "password123",
      });

      // 2. Present it back; DB row is valid and its hash matches.
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "ignored",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
        tokenHash: storedHash,
        user,
      });
      prisma.refreshToken.update.mockResolvedValue({});

      const rotated = await service.refresh(first.refreshToken);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      );
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(2); // login + refresh
      expect(rotated.accessToken).toBeTruthy();
    });

    it("rejects a missing or malformed token", async () => {
      await expect(service.refresh(undefined)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.refresh("not-a-jwt")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("rejects a revoked token row", async () => {
      const hash = await argon2.hash("password123");
      const user = buildUser(hash);
      prisma.user.findUnique.mockResolvedValue(user);
      let storedHash = "";
      prisma.refreshToken.create.mockImplementation(
        ({ data }: { data: { tokenHash: string } }) => {
          storedHash = data.tokenHash;
          return Promise.resolve({});
        },
      );
      const first = await service.login({
        email: "demo@studyplanner.dev",
        password: "password123",
      });
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "ignored",
        revokedAt: new Date(), // already revoked
        expiresAt: new Date(Date.now() + 100_000),
        tokenHash: storedHash,
        user,
      });
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("logout", () => {
    it("is a no-op for a missing token", async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("revokes a valid token", async () => {
      const hash = await argon2.hash("password123");
      prisma.user.findUnique.mockResolvedValue(buildUser(hash));
      prisma.refreshToken.create.mockResolvedValue({});
      const { refreshToken } = await service.login({
        email: "demo@studyplanner.dev",
        password: "password123",
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await service.logout(refreshToken);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("me", () => {
    it("returns the public user shape (no passwordHash)", async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser("secret-hash"));
      const user = await service.me("user-1");
      expect(user).toMatchObject({
        id: "user-1",
        email: "demo@studyplanner.dev",
        displayName: "Demo",
      });
      expect(user).not.toHaveProperty("passwordHash");
    });

    it("throws when the user is gone", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.me("user-1")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
