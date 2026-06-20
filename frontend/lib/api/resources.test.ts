import { describe, expect, it } from "vitest";
import { applyCardMove, type BoardWithColumns } from "./resources";

function makeBoard(): BoardWithColumns {
  return {
    id: "board-1",
    userId: "user-1",
    goalId: null,
    title: "Board",
    description: null,
    position: "a0",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    columns: [
      {
        id: "col-todo",
        boardId: "board-1",
        title: "To do",
        position: "a0",
        wipLimit: null,
        cards: [
          { ...baseCard, id: "card-1", columnId: "col-todo", position: "a0" },
          { ...baseCard, id: "card-2", columnId: "col-todo", position: "a1" },
        ],
      },
      {
        id: "col-doing",
        boardId: "board-1",
        title: "In progress",
        position: "a1",
        wipLimit: null,
        cards: [],
      },
    ],
  };
}

const baseCard = {
  id: "card-x",
  columnId: "col-todo",
  boardId: "board-1",
  goalId: null,
  title: "Card",
  description: null,
  position: "a0",
  startDate: null,
  dueDate: null,
  priority: "medium" as const,
  isCompleted: false,
  completedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("applyCardMove", () => {
  it("reorders a card within the same column", () => {
    const board = makeBoard();
    const moved = applyCardMove(board, "card-2", {
      columnId: "col-todo",
      position: "a",
    });
    const todo = moved.columns.find((c) => c.id === "col-todo")!;
    expect(todo.cards.map((c) => c.id)).toEqual(["card-2", "card-1"]);
  });

  it("moves a card to a different column and updates boardId/columnId", () => {
    const board = makeBoard();
    const moved = applyCardMove(board, "card-1", {
      columnId: "col-doing",
      position: "a0",
    });
    const todo = moved.columns.find((c) => c.id === "col-todo")!;
    const doing = moved.columns.find((c) => c.id === "col-doing")!;
    expect(todo.cards.map((c) => c.id)).toEqual(["card-2"]);
    expect(doing.cards.map((c) => c.id)).toEqual(["card-1"]);
    expect(doing.cards[0].columnId).toBe("col-doing");
    expect(doing.cards[0].boardId).toBe("board-1");
  });

  it("returns the board unchanged when the card isn't found", () => {
    const board = makeBoard();
    const moved = applyCardMove(board, "missing", {
      columnId: "col-doing",
      position: "a0",
    });
    expect(moved).toBe(board);
  });
});
