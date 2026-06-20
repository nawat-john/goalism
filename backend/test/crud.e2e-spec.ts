import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { AllExceptionsFilter } from "../src/common/http-exception.filter";
import { PrismaService } from "../src/prisma/prisma.service";
import { positionBetween } from "../src/common/position";

/**
 * Full-stack CRUD against a real Postgres (design: integration tests use a real
 * DB so cascades, constraints, and the denormalized `boardId` are exercised).
 * Requires `docker compose up -d` + migrations applied.
 */
describe("CRUD (e2e, real Postgres)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();
  const emailA = `crud-a-${stamp}@test.dev`;
  const emailB = `crud-b-${stamp}@test.dev`;
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
    await prisma.user.deleteMany({
      where: { email: { in: [emailA, emailB] } },
    });
    await app.close();
  });

  it("creates a goal and returns it with empty boards/milestones", async () => {
    const created = await http()
      .post("/api/v1/goals")
      .set(auth(tokenA))
      .send({ title: "Learn Spanish", targetDate: "2026-12-01" })
      .expect(201);
    expect(created.body.title).toBe("Learn Spanish");

    const got = await http()
      .get(`/api/v1/goals/${created.body.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(got.body.boards).toEqual([]);
    expect(got.body.milestones).toEqual([]);
  });

  it("seeds default columns when a board is created", async () => {
    const board = await http()
      .post("/api/v1/boards")
      .set(auth(tokenA))
      .send({ title: "Study board" })
      .expect(201);
    expect(board.body.columns.map((c: { title: string }) => c.title)).toEqual([
      "To do",
      "In progress",
      "Done",
    ]);
    // Positions are fractional keys in ascending order.
    const positions = board.body.columns.map(
      (c: { position: string }) => c.position,
    );
    expect([...positions].sort()).toEqual(positions);
  });

  it("creates a card with denormalized boardId and nests it under the board", async () => {
    const board = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "Nesting board" })
    ).body;
    const todo = board.columns[0];

    const card = await http()
      .post(`/api/v1/columns/${todo.id}/cards`)
      .set(auth(tokenA))
      .send({ title: "Flashcards", priority: "high" })
      .expect(201);
    expect(card.body.boardId).toBe(board.id); // denormalized
    expect(card.body.columnId).toBe(todo.id);

    const nested = await http()
      .get(`/api/v1/boards/${board.id}`)
      .set(auth(tokenA))
      .expect(200);
    const nestedTodo = nested.body.columns.find(
      (c: { id: string }) => c.id === todo.id,
    );
    expect(nestedTodo.cards).toHaveLength(1);
    expect(nestedTodo.cards[0].title).toBe("Flashcards");
  });

  it("stamps completedAt when a card is completed", async () => {
    const board = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "Complete board" })
    ).body;
    const card = (
      await http()
        .post(`/api/v1/columns/${board.columns[0].id}/cards`)
        .set(auth(tokenA))
        .send({ title: "Task" })
    ).body;

    const done = await http()
      .patch(`/api/v1/cards/${card.id}`)
      .set(auth(tokenA))
      .send({ isCompleted: true })
      .expect(200);
    expect(done.body.isCompleted).toBe(true);
    expect(done.body.completedAt).not.toBeNull();

    const reopened = await http()
      .patch(`/api/v1/cards/${card.id}`)
      .set(auth(tokenA))
      .send({ isCompleted: false })
      .expect(200);
    expect(reopened.body.completedAt).toBeNull();
  });

  it("scopes resources by user — other users get 404, not the data", async () => {
    const goal = (
      await http()
        .post("/api/v1/goals")
        .set(auth(tokenA))
        .send({ title: "A's private goal" })
    ).body;
    const board = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "A's board" })
    ).body;

    await http()
      .get(`/api/v1/goals/${goal.id}`)
      .set(auth(tokenB))
      .expect(404);
    // B cannot add a column to A's board.
    await http()
      .post(`/api/v1/boards/${board.id}/columns`)
      .set(auth(tokenB))
      .send({ title: "intruder" })
      .expect(404);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await http().get("/api/v1/goals").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("paginates goal lists with a cursor", async () => {
    const token = await register(`crud-page-${stamp}@test.dev`);
    for (let i = 0; i < 3; i++) {
      await http()
        .post("/api/v1/goals")
        .set(auth(token))
        .send({ title: `Goal ${i}` })
        .expect(201);
    }

    const page1 = await http()
      .get("/api/v1/goals?limit=2")
      .set(auth(token))
      .expect(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();

    const page2 = await http()
      .get(`/api/v1/goals?limit=2&cursor=${page1.body.nextCursor}`)
      .set(auth(token))
      .expect(200);
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    // No overlap between pages.
    const ids = new Set(page1.body.data.map((g: { id: string }) => g.id));
    expect(ids.has(page2.body.data[0].id)).toBe(false);
  });

  it("cascades card deletion when a board is removed", async () => {
    const board = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "Doomed board" })
    ).body;
    const card = (
      await http()
        .post(`/api/v1/columns/${board.columns[0].id}/cards`)
        .set(auth(tokenA))
        .send({ title: "Doomed card" })
    ).body;

    await http()
      .delete(`/api/v1/boards/${board.id}`)
      .set(auth(tokenA))
      .expect(204);

    expect(await prisma.card.findUnique({ where: { id: card.id } })).toBeNull();
    expect(
      await prisma.boardColumn.findUnique({
        where: { id: board.columns[0].id },
      }),
    ).toBeNull();
  });

  it("reorders a card within a column via PATCH /cards/:id/move", async () => {
    const board = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "Reorder board" })
    ).body;
    const columnId = board.columns[0].id;

    const cardA = (
      await http()
        .post(`/api/v1/columns/${columnId}/cards`)
        .set(auth(tokenA))
        .send({ title: "First" })
    ).body;
    const cardB = (
      await http()
        .post(`/api/v1/columns/${columnId}/cards`)
        .set(auth(tokenA))
        .send({ title: "Second" })
    ).body;
    expect(cardA.position < cardB.position).toBe(true);

    // Move cardB to the front: position before cardA's current position.
    const moved = await http()
      .patch(`/api/v1/cards/${cardB.id}/move`)
      .set(auth(tokenA))
      .send({ columnId, position: positionBetween(null, cardA.position) })
      .expect(200);
    expect(moved.body.position < cardA.position).toBe(true);

    const nested = await http()
      .get(`/api/v1/boards/${board.id}`)
      .set(auth(tokenA))
      .expect(200);
    const reorderedColumn = nested.body.columns.find(
      (c: { id: string }) => c.id === columnId,
    );
    expect(
      reorderedColumn.cards.map((c: { id: string }) => c.id),
    ).toEqual([cardB.id, cardA.id]);
  });

  it("moves a card across columns and keeps boardId/columnId consistent", async () => {
    const board = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "Cross-column board" })
    ).body;
    const [todoId, inProgressId] = board.columns.map(
      (c: { id: string }) => c.id,
    );

    const card = (
      await http()
        .post(`/api/v1/columns/${todoId}/cards`)
        .set(auth(tokenA))
        .send({ title: "Movable" })
    ).body;

    const moved = await http()
      .patch(`/api/v1/cards/${card.id}/move`)
      .set(auth(tokenA))
      .send({ columnId: inProgressId, position: positionBetween(null, null) })
      .expect(200);
    expect(moved.body.columnId).toBe(inProgressId);
    expect(moved.body.boardId).toBe(board.id); // denormalized boardId stays consistent

    const fromDb = await prisma.card.findUnique({ where: { id: card.id } });
    expect(fromDb?.columnId).toBe(inProgressId);
    expect(fromDb?.boardId).toBe(board.id);
  });

  it("404s moving a card into a column owned by another user", async () => {
    const boardA = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "A's move board" })
    ).body;
    const card = (
      await http()
        .post(`/api/v1/columns/${boardA.columns[0].id}/cards`)
        .set(auth(tokenA))
        .send({ title: "A's card" })
    ).body;
    const boardB = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenB))
        .send({ title: "B's board" })
    ).body;

    await http()
      .patch(`/api/v1/cards/${card.id}/move`)
      .set(auth(tokenA))
      .send({ columnId: boardB.columns[0].id, position: positionBetween(null, null) })
      .expect(404);
  });

  it("manages labels and card-label links", async () => {
    const label = await http()
      .post("/api/v1/labels")
      .set(auth(tokenA))
      .send({ name: "urgent", color: "#f00" })
      .expect(201);

    const board = (
      await http()
        .post("/api/v1/boards")
        .set(auth(tokenA))
        .send({ title: "Label board" })
    ).body;
    const card = (
      await http()
        .post(`/api/v1/columns/${board.columns[0].id}/cards`)
        .set(auth(tokenA))
        .send({ title: "Labelled" })
    ).body;

    await http()
      .post(`/api/v1/cards/${card.id}/labels/${label.body.id}`)
      .set(auth(tokenA))
      .expect(204);

    const withLabel = await http()
      .get(`/api/v1/cards/${card.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(withLabel.body.labels).toHaveLength(1);
    expect(withLabel.body.labels[0].label.name).toBe("urgent");

    await http()
      .delete(`/api/v1/cards/${card.id}/labels/${label.body.id}`)
      .set(auth(tokenA))
      .expect(204);
    const withoutLabel = await http()
      .get(`/api/v1/cards/${card.id}`)
      .set(auth(tokenA))
      .expect(200);
    expect(withoutLabel.body.labels).toHaveLength(0);
  });
});
