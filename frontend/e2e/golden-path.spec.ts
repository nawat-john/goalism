import { expect, test, type Page } from "@playwright/test";

// Golden path from the design roadmap (§12, Phase 6): register/login,
// create a goal, then drag a card across board columns. A fresh user is
// registered per run (unique email) so the suite doesn't depend on seeded
// demo data and is safe to re-run against a persistent dev/staging DB.

function columnByTitle(page: Page, title: string) {
  return page.locator("section").filter({ hasText: title }).first();
}

test("register, create a goal, add a board, and drag a card between columns", async ({
  page,
}) => {
  const unique = Date.now();
  const email = `e2e-${unique}@example.com`;
  const goalTitle = `E2E goal ${unique}`;
  const boardTitle = `E2E board ${unique}`;
  const cardTitle = `E2E card ${unique}`;

  await page.goto("/register");
  await page.getByLabel("Display name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(page.getByRole("heading", { name: "Your goals" })).toBeVisible();

  await page.getByPlaceholder("New goal title…").fill(goalTitle);
  await page.getByRole("button", { name: "Add goal" }).click();
  await page.getByRole("link", { name: new RegExp(goalTitle) }).click();

  await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible();
  await page.getByPlaceholder("New board title…").fill(boardTitle);
  await page.getByRole("button", { name: "Add board" }).click();
  await page.getByRole("link", { name: boardTitle }).click();

  await expect(page.getByRole("heading", { name: boardTitle })).toBeVisible();
  const todoColumn = columnByTitle(page, "To do");
  const inProgressColumn = columnByTitle(page, "In progress");
  await expect(todoColumn).toBeVisible();
  await expect(inProgressColumn).toBeVisible();

  await todoColumn.getByPlaceholder("Add a card…").fill(cardTitle);
  await todoColumn.getByPlaceholder("Add a card…").press("Enter");

  const card = page.locator("li", { hasText: cardTitle });
  await expect(card).toBeVisible();
  await expect(todoColumn.getByText(cardTitle)).toBeVisible();

  const handle = card.locator('[aria-label="Drag to reorder"]');
  const handleBox = await handle.boundingBox();
  const targetBox = await inProgressColumn.boundingBox();
  if (!handleBox || !targetBox) throw new Error("Could not measure drag elements");

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  // First move must clear dnd-kit's PointerSensor activation distance (4px)
  // before the drag is recognized; later moves walk over to the target column.
  await page.mouse.move(
    handleBox.x + handleBox.width / 2 + 10,
    handleBox.y + handleBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();

  await expect(inProgressColumn.getByText(cardTitle)).toBeVisible();
  await expect(todoColumn.getByText(cardTitle)).not.toBeVisible();

  await page.reload();
  await expect(inProgressColumn.getByText(cardTitle)).toBeVisible();
  await expect(todoColumn.getByText(cardTitle)).not.toBeVisible();
});
