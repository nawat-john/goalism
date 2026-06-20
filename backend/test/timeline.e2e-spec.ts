import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Milestones CRUD + GET /timeline against a real Postgres (design §7.2: combine
 * milestones + cards with a due date, filterable by `from`/`to`/`goalId`).
 */
describe("Timeline + milestones (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const emailA = `tl-a-${stamp}@test.dev`;
  const emailB = `tl-b-${stamp}@test.dev`;
  let tokenA = "";
  let tokenB = "";

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const http = () => request(app.getHttpServer());
  const register = async (email: string) => {
    const res = await http()
      .post("/api/v1/auth/register")
      .send({ email, password: "password123", displayName: email });
    return res.body.accessToken as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    tokenA = await register(emailA);
    tokenB = await register(emailB);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    await app.close();
  });

  it("creates, updates, and deletes a milestone", async () => {
    const created = await http()
      .post("/api/v1/milestones")
      .set(auth(tokenA))
      .send({ title: "Mock exam", type: "deadline", date: "2026-08-01T00:00:00.000Z" })
      .expect(201);
    expect(created.body.title).toBe("Mock exam");
    expect(created.body.type).toBe("deadline");

    const updated = await http()
      .patch(`/api/v1/milestones/${created.body.id}`)
      .set(auth(tokenA))
      .send({ title: "Mock exam (rescheduled)" })
      .expect(200);
    expect(updated.body.title).toBe("Mock exam (rescheduled)");

    await http()
      .delete(`/api/v1/milestones/${created.body.id}`)
      .set(auth(tokenA))
      .expect(204);

    expect(
      await prisma.milestone.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
  });

  it("404s updating/deleting another user's milestone", async () => {
    const created = (
      await http()
        .post("/api/v1/milestones")
        .set(auth(tokenA))
        .send({ title: "A's milestone", date: "2026-08-01T00:00:00.000Z" })
    ).body;

    await http()
      .patch(`/api/v1/milestones/${created.id}`)
      .set(auth(tokenB))
      .send({ title: "intruder" })
      .expect(404);
    await http()
      .delete(`/api/v1/milestones/${created.id}`)
      .set(auth(tokenB))
      .expect(404);
  });

  it("rejects a milestone linked to a goal owned by someone else", async () => {
    const goalB = (
      await http()
        .post("/api/v1/goals")
        .set(auth(tokenB))
        .send({ title: "B's goal" })
    ).body;

    await http()
      .post("/api/v1/milestones")
      .set(auth(tokenA))
      .send({ title: "intruder", date: "2026-08-01T00:00:00.000Z", goalId: goalB.id })
      .expect(403);
  });

  it("combines milestones + cards with a due date, filtered by range and goal", async () => {
    const goal = (
      await http()
        .post("/api/v1/goals")
        .set(auth(tokenA))
        .send({ title: "Timeline goal" })
    ).body;
    const board = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "Timeline board", goalId: goal.id })
    ).body;

    await http()
      .post("/api/v1/milestones")
      .set(auth(tokenA))
      .send({ title: "In range", date: "2026-07-15T00:00:00.000Z", goalId: goal.id })
      .expect(201);
    await http()
      .post("/api/v1/milestones")
      .set(auth(tokenA))
      .send({ title: "Out of range", date: "2027-01-01T00:00:00.000Z", goalId: goal.id })
      .expect(201);

    await http()
      .post(`/api/v1/columns/${board.columns[0].id}/cards`)
      .set(auth(tokenA))
      .send({ title: "Due in range", dueDate: "2026-07-20T00:00:00.000Z", goalId: goal.id })
      .expect(201);
    await http()
      .post(`/api/v1/columns/${board.columns[0].id}/cards`)
      .set(auth(tokenA))
      .send({ title: "No due date", goalId: goal.id })
      .expect(201);

    const timeline = await http()
      .get(
        `/api/v1/timeline?from=2026-07-01T00:00:00.000Z&to=2026-07-31T23:59:59.000Z&goalId=${goal.id}`,
      )
      .set(auth(tokenA))
      .expect(200);

    expect(timeline.body.milestones.map((m: { title: string }) => m.title)).toEqual([
      "In range",
    ]);
    expect(timeline.body.cards.map((c: { title: string }) => c.title)).toEqual([
      "Due in range",
    ]);
  });

  it("scopes the timeline by user — other users see nothing", async () => {
    await http()
      .post("/api/v1/milestones")
      .set(auth(tokenA))
      .send({ title: "A only", date: "2026-09-01T00:00:00.000Z" })
      .expect(201);

    const timeline = await http()
      .get("/api/v1/timeline?from=2026-01-01T00:00:00.000Z&to=2026-12-31T00:00:00.000Z")
      .set(auth(tokenB))
      .expect(200);

    expect(
      timeline.body.milestones.some((m: { title: string }) => m.title === "A only"),
    ).toBe(false);
  });
});
