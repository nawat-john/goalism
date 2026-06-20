import { PrismaClient } from "../generated/client";
import * as argon2 from "argon2";
import { generateKeyBetween } from "fractional-indexing";

const prisma = new PrismaClient();

/**
 * Minimal dev seed: one demo user with a goal, a board, columns and a card.
 * Idempotent on the demo email so repeated runs don't error.
 */
async function main() {
  const email = "demo@studyplanner.dev";

  await prisma.user.deleteMany({ where: { email } });

  const passwordHash = await argon2.hash("password123");
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: "Demo User",
    },
  });

  const goal = await prisma.goal.create({
    data: {
      userId: user.id,
      title: "Pass TOEFL 100",
      description: "Reach a TOEFL score of 100 in three months.",
      targetDate: new Date("2026-09-19"),
      progress: 0,
    },
  });

  // Real fractional-indexing keys, not bare letters — `appendPosition` (used
  // when the app creates the next board/column/card) rejects malformed keys,
  // so seed data has to play by the same rules.
  const todoPosition = generateKeyBetween(null, null);
  const inProgressPosition = generateKeyBetween(todoPosition, null);
  const donePosition = generateKeyBetween(inProgressPosition, null);

  const board = await prisma.board.create({
    data: {
      userId: user.id,
      goalId: goal.id,
      title: "TOEFL prep",
      position: generateKeyBetween(null, null),
      columns: {
        create: [
          { title: "To do", position: todoPosition },
          { title: "In progress", position: inProgressPosition },
          { title: "Done", position: donePosition },
        ],
      },
    },
    include: { columns: true },
  });

  const todo = board.columns.find((c) => c.title === "To do")!;
  await prisma.card.create({
    data: {
      columnId: todo.id,
      boardId: board.id,
      goalId: goal.id,
      title: "Take a diagnostic practice test",
      position: generateKeyBetween(null, null),
      priority: "high",
    },
  });

  console.log(`Seeded demo user ${email} (password: password123)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
