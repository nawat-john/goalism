import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * AI assistant (design §6): POST /goals/:id/apply-plan persists an
 * AI-proposed plan via the normal data path (real Postgres, single
 * transaction); POST /ai/proxy/generate is a stateless pass-through to
 * Gemini — mocked here so the suite stays deterministic/offline.
 */
describe("AI assistant (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const emailA = `ai-a-${stamp}@test.dev`;
  const emailB = `ai-b-${stamp}@test.dev`;
  let tokenA = "";
  let tokenB = "";
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

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

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it("creates a default board+column and bulk-creates cards/milestones from a plan", async () => {
    const goal = (
      await http()
        .post("/api/v1/goals")
        .set(auth(tokenA))
        .send({ title: "Learn Spanish" })
    ).body;

    const res = await http()
      .post(`/api/v1/goals/${goal.id}/apply-plan`)
      .set(auth(tokenA))
      .send({
        cards: [
          { title: "Week 1: alphabet & greetings", priority: "high" },
          { title: "Week 2: present tense verbs" },
        ],
        milestones: [{ title: "Mock exam", date: "2026-09-01T00:00:00.000Z" }],
      })
      .expect(201);

    expect(res.body.board.title).toBe("AI Plan");
    expect(res.body.cards).toHaveLength(2);
    expect(res.body.cards[0].position < res.body.cards[1].position).toBe(true);
    expect(res.body.cards[0].boardId).toBe(res.body.board.id);
    expect(res.body.milestones).toHaveLength(1);
    expect(res.body.milestones[0].goalId).toBe(goal.id);

    const got = await http()
      .get(`/api/v1/boards/${res.body.board.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(got.body.columns[0].cards.map((c: { title: string }) => c.title)).toEqual([
      "Week 1: alphabet & greetings",
      "Week 2: present tense verbs",
    ]);
  });

  it("appends to an existing board's first column instead of creating a new board", async () => {
    const goal = (
      await http()
        .post("/api/v1/goals")
        .set(auth(tokenA))
        .send({ title: "Existing board goal" })
    ).body;
    const board = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "Manual board", goalId: goal.id })
    ).body;
    await http()
      .post(`/api/v1/columns/${board.columns[0].id}/cards`)
      .set(auth(tokenA))
      .send({ title: "Pre-existing card" })
      .expect(201);

    const res = await http()
      .post(`/api/v1/goals/${goal.id}/apply-plan`)
      .set(auth(tokenA))
      .send({ cards: [{ title: "AI-added card" }] })
      .expect(201);

    expect(res.body.board.id).toBe(board.id);

    const got = await http()
      .get(`/api/v1/boards/${board.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(got.body.columns[0].cards.map((c: { title: string }) => c.title)).toEqual([
      "Pre-existing card",
      "AI-added card",
    ]);
  });

  it("404s applying a plan to a goal owned by another user", async () => {
    const goal = (
      await http()
        .post("/api/v1/goals")
        .set(auth(tokenA))
        .send({ title: "A's goal" })
    ).body;

    await http()
      .post(`/api/v1/goals/${goal.id}/apply-plan`)
      .set(auth(tokenB))
      .send({ cards: [{ title: "intruder card" }] })
      .expect(404);
  });

  it("forwards to Gemini with x-goog-api-key and never via a query string", async () => {
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }), {
        status: 200,
      }),
    );

    const res = await http()
      .post("/api/v1/ai/proxy/generate")
      .set(auth(tokenA))
      .set("x-user-gemini-key", "test-key-123")
      .send({ model: "gemini-2.5-flash", payload: { contents: [] } })
      .expect(201);

    expect(res.body.candidates[0].content.parts[0].text).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).not.toContain("test-key-123");
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "test-key-123",
    );
  });

  it("rejects the proxy call when the key header is missing", async () => {
    await http()
      .post("/api/v1/ai/proxy/generate")
      .set(auth(tokenA))
      .send({ model: "gemini-2.5-flash", payload: {} })
      .expect(400);
  });

  it("maps a 429 from Gemini to AI_QUOTA_EXCEEDED", async () => {
    fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
        status: 429,
      }),
    );

    const res = await http()
      .post("/api/v1/ai/proxy/generate")
      .set(auth(tokenA))
      .set("x-user-gemini-key", "test-key-123")
      .send({ model: "gemini-2.5-flash", payload: {} })
      .expect(400);

    expect(res.body.error.code).toBe("AI_QUOTA_EXCEEDED");
  });
});
