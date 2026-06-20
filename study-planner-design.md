# StudyPlanner — Commercial Architecture & Design Doc

> เว็บวางแผนการเรียนแบบ full-feature: ตั้งเป้าหมาย (goals), สร้าง timeline, จัดการงานแบบ kanban card, พร้อมผู้ช่วย AI ที่ใช้ Gemini API key ของผู้ใช้เอง (BYOK)
> Stack: **Next.js (FE) · NestJS + Node (BE) · PostgreSQL (DB)** — target scale: startup เล็ก (หลักร้อย–พันคน)
> เอกสารนี้ครอบคลุมตั้งแต่ออกแบบ → dev → test → deploy

---

## 1. หลักการออกแบบ (Design principles)

หกข้อที่ใช้ตัดสินใจตลอดทั้งดีไซน์:

1. **แยก 3 ชั้นชัดเจน** — frontend, backend, database เป็นคนละ deployable หน่วย คุยกันผ่าน contract (REST + zod schema ที่ share กัน) เปลี่ยนชั้นใดชั้นหนึ่งได้โดยไม่ลามไปอีกชั้น
2. **Type-safe ตั้งแต่ DB ถึง UI** — Prisma สร้าง type จาก schema, zod schema ที่อยู่ใน `packages/shared` ถูกใช้ validate ทั้งฝั่ง BE และ FE ผิด type จะรู้ตอน compile ไม่ใช่ตอน runtime
3. **AI layer ถอดเปลี่ยนได้ (pluggable)** — ส่วน AI ซ่อนหลัง interface เดียว `AIProvider` สลับระหว่าง "ยิงตรงจาก client" กับ "thin proxy" ได้โดยไม่แตะ business logic (ดูเหตุผลในข้อ 6)
4. **Stateless backend** — backend ไม่เก็บ session ใน memory, scale แนวนอนได้ (เพิ่ม instance ได้เลย) state ทั้งหมดอยู่ใน PostgreSQL
5. **Secure by default** — JWT access token อายุสั้นอยู่ใน memory, refresh token ใน httpOnly cookie, validate ทุก input, ไม่เก็บความลับของผู้ใช้ที่ไม่จำเป็น
6. **ไม่ over-engineer** — scale หลักพันคนไม่ต้องใช้ microservices / Kafka / k8s ตั้งแต่วันแรก เริ่มด้วย modular monolith + managed services แล้วค่อยแตกเมื่อมีหลักฐานว่าต้อง

---

## 2. Tech stack สรุป

| ชั้น | เลือกใช้ | เหตุผลย่อ |
|---|---|---|
| Frontend | Next.js (App Router) + React + TypeScript | SSR/streaming, routing, ecosystem ใหญ่ |
| UI | Tailwind CSS + shadcn/ui | คุม design system ได้, ไม่ผูก vendor |
| Server state | TanStack Query | cache/refetch/optimistic update ของ data จาก API |
| Client state | Zustand | UI state เบาๆ (modal, board drag) |
| Drag & drop | dnd-kit | accessible, ทำ kanban + reorder ได้ดี |
| Backend | NestJS + TypeScript | โครงสร้างชัด (module/DI), testable, มี guard/pipe/interceptor พร้อม — เหมาะ commercial |
| ORM | Prisma | migration, type-safe query, DX ดี |
| Database | PostgreSQL 16 | relational, JSONB, full-text search, แข็งแรง |
| Validation | zod (shared) + class-validator (DTO) | contract เดียวใช้ทั้ง FE/BE |
| Auth | JWT (access + refresh) + argon2 | stateless, มาตรฐาน |
| AI | Google Gemini ผ่าน `@google/genai` (BYOK) | ใช้โควต้าฟรีของผู้ใช้ |
| Monorepo | pnpm workspaces + Turborepo | share types, build cache |
| Testing | Vitest + RTL + Playwright (FE), Jest + supertest (BE) | unit → integration → e2e |
| CI/CD | GitHub Actions | ฟรีสำหรับ repo เล็ก, integrate ง่าย |

> **ทางเลือกที่เบากว่า**: ถ้าทีมเล็กมากและอยากลด boilerplate ของ NestJS เปลี่ยน backend เป็น **Fastify + Prisma** ได้ โครงสร้างเอกสารนี้ยังใช้ได้เหมือนเดิม แค่ NestJS ให้ guardrails สำหรับงาน commercial ระยะยาวมากกว่า

---

## 3. ภาพรวมสถาปัตยกรรม

```mermaid
graph TD
  subgraph Browser["User's browser"]
    FE["Next.js app<br/>(goals · timeline · board)"]
    AI["AI assistant module<br/>(holds user's Gemini key)"]
  end

  subgraph Cloud["Your infrastructure"]
    BE["NestJS API<br/>(auth · goals · boards · cards)"]
    DB[("PostgreSQL")]
  end

  G["Google Gemini API<br/>(external)"]

  FE -->|"REST + JWT (app data)"| BE
  BE -->|"Prisma"| DB
  AI -.->|"direct call · user's key"| G
  AI -.->|"OR thin proxy mode"| BE
  BE -.->|"forward (no store/log)"| G

  classDef ext fill:#FAEEDA,stroke:#BA7517,color:#633806;
  class G ext;
```

จุดสำคัญ: เส้นทึบคือ "ข้อมูลแอป" (goals, cards) วิ่งผ่าน backend ปกติ. เส้นประคือ "การเรียก AI" ซึ่งมี 2 โหมด (ดูข้อ 6) — โหมด direct ยิงจาก browser ตรงไป Gemini ไม่ผ่าน backend เลย; โหมด proxy ส่งผ่าน backend แบบไม่เก็บ key

---

## 4. ส่วนที่ 1 — Frontend (Next.js)

### 4.1 โครงสร้างโฟลเดอร์

```
apps/web/
  app/
    (auth)/login/page.tsx
    (auth)/register/page.tsx
    (app)/dashboard/page.tsx          # ภาพรวม goals + ความคืบหน้า
    (app)/goals/[goalId]/page.tsx     # รายละเอียดเป้าหมาย + boards ที่ผูกอยู่
    (app)/board/[boardId]/page.tsx    # kanban view
    (app)/timeline/page.tsx           # timeline view (gantt-ish)
    (app)/settings/page.tsx           # ใส่ Gemini key, จัดการ AI mode
    layout.tsx
  components/
    board/                            # Column, Card, CardModal, dnd handlers
    timeline/                         # TimelineTrack, Milestone, DateScale
    goals/                            # GoalCard, ProgressRing
    ai/                               # AIPanel, AISuggestionList, KeyInput
    ui/                               # shadcn primitives
  lib/
    api/                              # typed API client (fetch wrapper + zod parse)
    ai/                               # AIProvider interface + implementations
    auth/                             # token store (in-memory), refresh logic
    query/                            # TanStack Query client + keys
  stores/                            # Zustand stores (board UI, modals)
```

### 4.2 การจัดการ state

- **Server state (จาก API)**: TanStack Query ทั้งหมด — `useQuery(['board', id])`, `useMutation` พร้อม optimistic update เวลาลาก card (อัปเดต UI ทันที, rollback ถ้า API fail)
- **Client/UI state**: Zustand — สถานะ modal, การ์ดที่กำลังลาก, filter ของ board
- **ห้ามเก็บ Gemini key ใน global store ที่ persist** — ดูข้อ 6.3

### 4.3 Auth flow ฝั่ง client

- access token (อายุ ~15 นาที) เก็บใน **memory เท่านั้น** (ตัวแปรใน module / Zustand แบบไม่ persist)
- refresh token อยู่ใน **httpOnly cookie** — JS อ่านไม่ได้ กัน XSS ขโมย
- มี fetch interceptor: ถ้าเจอ 401 → เรียก `/auth/refresh` (cookie ไปเอง) → ได้ access token ใหม่ → retry คำขอเดิม
- ตอนเปิดแอปครั้งแรก (ยังไม่มี access token ใน memory) → ยิง `/auth/refresh` ก่อนเพื่อ rehydrate

### 4.4 Board / drag & drop

- ใช้ dnd-kit; แต่ละ card มีฟิลด์ `position` (ดูข้อ 5.4 เรื่อง fractional ranking) — ลากแล้วอัปเดตเฉพาะ position ของ card ที่ขยับ ไม่ต้อง renumber ทั้งคอลัมน์
- ลาก = optimistic update + `PATCH /cards/:id/move` เบื้องหลัง

---

## 5. ส่วนที่ 3 — Database (PostgreSQL)

> ใส่ก่อน backend เพราะ schema เป็นรากฐานที่ API จะอ้างถึง

### 5.1 ER diagram

```mermaid
erDiagram
  USERS ||--o{ GOALS : owns
  USERS ||--o{ BOARDS : owns
  USERS ||--o{ LABELS : owns
  USERS ||--o{ REFRESH_TOKENS : has
  GOALS ||--o{ BOARDS : groups
  GOALS ||--o{ MILESTONES : has
  BOARDS ||--o{ BOARD_COLUMNS : contains
  BOARD_COLUMNS ||--o{ CARDS : holds
  CARDS ||--o{ CARD_LABELS : tagged
  LABELS ||--o{ CARD_LABELS : on
  CARDS ||--o{ MILESTONES : marks

  USERS {
    uuid id PK
    citext email UK
    text password_hash
    text display_name
    timestamptz created_at
  }
  GOALS {
    uuid id PK
    uuid user_id FK
    text title
    text status
    date target_date
    int progress
  }
  BOARDS {
    uuid id PK
    uuid user_id FK
    uuid goal_id FK
    text title
  }
  BOARD_COLUMNS {
    uuid id PK
    uuid board_id FK
    text title
    text position
  }
  CARDS {
    uuid id PK
    uuid column_id FK
    text title
    text position
    timestamptz due_date
    text priority
  }
```

### 5.2 SQL schema (PostgreSQL)

```sql
-- เปิด extension ที่ใช้
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- email case-insensitive

-- ---------- USERS ----------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- REFRESH TOKENS (rotation) ----------
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,            -- เก็บ hash ของ token ไม่เก็บ token ดิบ
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);

-- ---------- GOALS ----------
CREATE TYPE goal_status AS ENUM ('active','achieved','on_hold','archived');
CREATE TABLE goals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      goal_status NOT NULL DEFAULT 'active',
  target_date DATE,
  progress    SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_goals_user ON goals(user_id);

-- ---------- BOARDS ----------
CREATE TABLE boards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id     UUID REFERENCES goals(id) ON DELETE SET NULL,  -- board ผูก goal หรือเดี่ยวก็ได้
  title       TEXT NOT NULL,
  description TEXT,
  position    TEXT NOT NULL,                                  -- fractional rank
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_boards_user ON boards(user_id);
CREATE INDEX idx_boards_goal ON boards(goal_id);

-- ---------- BOARD COLUMNS (lists) ----------
CREATE TABLE board_columns (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  position   TEXT NOT NULL,
  wip_limit  SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_columns_board ON board_columns(board_id);

-- ---------- CARDS ----------
CREATE TYPE card_priority AS ENUM ('low','medium','high','urgent');
CREATE TABLE cards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id    UUID NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  board_id     UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE, -- denormalize เพื่อ query เร็ว
  goal_id      UUID REFERENCES goals(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  position     TEXT NOT NULL,                 -- fractional rank ภายในคอลัมน์
  start_date   TIMESTAMPTZ,
  due_date     TIMESTAMPTZ,
  priority     card_priority NOT NULL DEFAULT 'medium',
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cards_column ON cards(column_id);
CREATE INDEX idx_cards_board  ON cards(board_id);
CREATE INDEX idx_cards_due    ON cards(due_date);

-- ---------- LABELS ----------
CREATE TABLE labels (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL
);
CREATE TABLE card_labels (
  card_id  UUID NOT NULL REFERENCES cards(id)  ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);

-- ---------- MILESTONES (timeline markers) ----------
CREATE TYPE milestone_type AS ENUM ('milestone','deadline','event');
CREATE TABLE milestones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id    UUID REFERENCES goals(id) ON DELETE CASCADE,
  card_id    UUID REFERENCES cards(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  type       milestone_type NOT NULL DEFAULT 'milestone',
  date       TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_milestones_user ON milestones(user_id);
CREATE INDEX idx_milestones_date ON milestones(date);

-- ---------- AI SUGGESTIONS (metadata เท่านั้น) ----------
-- เก็บประวัติแผนที่ AI สร้าง "หลังจากผู้ใช้ยอมรับ" — ไม่เก็บ key, ไม่เก็บ prompt เต็มถ้าไม่จำเป็น
CREATE TABLE ai_suggestions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id     UUID REFERENCES goals(id) ON DELETE SET NULL,
  model       TEXT NOT NULL,           -- เช่น 'gemini-2.5-flash'
  summary     TEXT,                    -- สรุปสั้นๆ ว่าแนะนำอะไร
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> **สังเกต: ไม่มีตารางเก็บ Gemini API key เลย** — โดยตั้งใจ key อยู่ฝั่ง client เท่านั้น (ดูข้อ 6.3)

### 5.3 Prisma schema (เทียบเท่า)

```prisma
// apps/api/prisma/schema.prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum GoalStatus   { active achieved on_hold archived }
enum CardPriority { low medium high urgent }
enum MilestoneType{ milestone deadline event }

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  displayName  String   @map("display_name")
  avatarUrl    String?  @map("avatar_url")
  goals        Goal[]
  boards       Board[]
  labels       Label[]
  refreshTokens RefreshToken[]
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt      @map("updated_at")
  @@map("users")
}

model Goal {
  id          String     @id @default(uuid())
  userId      String     @map("user_id")
  user        User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  description String?
  status      GoalStatus @default(active)
  targetDate  DateTime?  @map("target_date") @db.Date
  progress    Int        @default(0)
  color       String?
  boards      Board[]
  milestones  Milestone[]
  cards       Card[]
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt      @map("updated_at")
  @@index([userId])
  @@map("goals")
}

model Board {
  id          String        @id @default(uuid())
  userId      String        @map("user_id")
  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  goalId      String?       @map("goal_id")
  goal        Goal?         @relation(fields: [goalId], references: [id], onDelete: SetNull)
  title       String
  description String?
  position    String
  columns     BoardColumn[]
  cards       Card[]
  createdAt   DateTime      @default(now()) @map("created_at")
  updatedAt   DateTime      @updatedAt      @map("updated_at")
  @@index([userId])
  @@map("boards")
}

model BoardColumn {
  id        String   @id @default(uuid())
  boardId   String   @map("board_id")
  board     Board    @relation(fields: [boardId], references: [id], onDelete: Cascade)
  title     String
  position  String
  wipLimit  Int?     @map("wip_limit")
  cards     Card[]
  @@index([boardId])
  @@map("board_columns")
}

model Card {
  id          String       @id @default(uuid())
  columnId    String       @map("column_id")
  column      BoardColumn  @relation(fields: [columnId], references: [id], onDelete: Cascade)
  boardId     String       @map("board_id")
  board       Board        @relation(fields: [boardId], references: [id], onDelete: Cascade)
  goalId      String?      @map("goal_id")
  goal        Goal?        @relation(fields: [goalId], references: [id], onDelete: SetNull)
  title       String
  description String?
  position    String
  startDate   DateTime?    @map("start_date")
  dueDate     DateTime?    @map("due_date")
  priority    CardPriority @default(medium)
  isCompleted Boolean      @default(false) @map("is_completed")
  completedAt DateTime?    @map("completed_at")
  labels      CardLabel[]
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt      @map("updated_at")
  @@index([columnId])
  @@index([boardId])
  @@map("cards")
}

model Label {
  id     String      @id @default(uuid())
  userId String      @map("user_id")
  user   User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  name   String
  color  String
  cards  CardLabel[]
  @@map("labels")
}

model CardLabel {
  cardId  String @map("card_id")
  labelId String @map("label_id")
  card    Card   @relation(fields: [cardId],  references: [id], onDelete: Cascade)
  label   Label  @relation(fields: [labelId], references: [id], onDelete: Cascade)
  @@id([cardId, labelId])
  @@map("card_labels")
}

model Milestone {
  id        String        @id @default(uuid())
  userId    String        @map("user_id")
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  goalId    String?       @map("goal_id")
  goal      Goal?         @relation(fields: [goalId], references: [id], onDelete: Cascade)
  title     String
  type      MilestoneType @default(milestone)
  date      DateTime
  createdAt DateTime      @default(now()) @map("created_at")
  @@index([userId])
  @@index([date])
  @@map("milestones")
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @map("token_hash")
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  userAgent String?   @map("user_agent")
  createdAt DateTime  @default(now()) @map("created_at")
  @@index([userId])
  @@map("refresh_tokens")
}
```

### 5.4 การเรียงลำดับ (ordering) — fractional ranking

card/column ใช้ฟิลด์ `position` เป็น **string แบบ fractional/lexicographic rank** (เช่น LexoRank หรือ library `fractional-indexing`) แทนที่จะเป็นเลข int ต่อเนื่อง เหตุผล: เวลาแทรก card ระหว่าง 2 ใบ แค่คำนวณ position ใหม่ที่อยู่ "ระหว่างกลาง" (เช่น ระหว่าง `"aa"` กับ `"ab"` ได้ `"aam"`) → อัปเดต **แถวเดียว** ไม่ต้อง UPDATE ทั้งคอลัมน์ ลดการชนกันเวลาหลายคนลากพร้อมกัน

---

## 6. ผู้ช่วย AI (Gemini, BYOK) — หัวใจของฟีเจอร์

### 6.1 แนวคิด

ผู้ใช้เอา **Gemini API key ของตัวเอง** มาใส่ → แอปใช้ key + โควต้าฟรีของผู้ใช้ช่วยวางแผน (เช่น "แตกเป้าหมาย 'สอบ TOEFL 100' เป็น card รายสัปดาห์" หรือ "จัด timeline 3 เดือน") คล้าย assistant ใน Google Sheets — แอป**ไม่ต้องจ่ายค่า API** และ**ไม่ถือ key รวมของระบบ**

### 6.2 ประเด็นสำคัญ: ทำไมต้อง pluggable (อ่านก่อนเขียนโค้ด)

ความตั้งใจเดิม "ยิงตรงจาก client เพื่อความปลอดภัย" มีจุดที่ต้องเข้าใจ 2 เรื่อง:

1. **เรื่องความปลอดภัย**: จุดยืนทางการของ Google คือ "อย่า expose key ฝั่ง client ใน production" เพราะ key ใน client code ถูกดึงออกได้ — แต่คำเตือนนี้พูดถึงกรณี "เจ้าของแอปฝัง key ตัวเอง" (key เดียวใช้ร่วม) ซึ่ง**ต่างจาก BYOK**: ในเคสนี้เป็น key ของผู้ใช้แต่ละคน ใช้โควต้าของตัวเอง ไม่มี key ส่วนกลางให้รั่ว ความเสี่ยงจึงเป็นของผู้ใช้เองและผู้ใช้รู้ตัว → BYOK เป็นข้อยกเว้นที่สมเหตุผลของกฎ "ห้าม client-side" ประโยชน์ที่แท้จริงของ client-side คือ **เซิร์ฟเวอร์ของคุณไม่เคยถือความลับของใคร** (ลดภาระ/ความรับผิดเวลา data breach)

2. **เรื่องเทคนิค (CORS)**: การยิง `generativelanguage.googleapis.com` ตรงจาก browser **มักเจอ CORS error** — browser block ถ้า response ไม่มี header ที่อนุญาต วิธีแก้ที่นิยมคือมี backend proxy ยิงแทน ดังนั้นแบบ "ยิงตรง" อาจใช้ไม่ได้เสมอไปขึ้นกับสภาพแวดล้อม

**สรุปการตัดสินใจ**: ออกแบบชั้น AI ให้มี interface เดียว แล้วมี 2 implementation สลับได้ผ่าน setting → ได้ทั้งความตั้งใจเดิมและไม่ติดกับดัก CORS

```typescript
// apps/web/lib/ai/provider.ts
export interface AIProvider {
  generatePlan(input: PlanRequest): Promise<PlanSuggestion>;
}

export interface PlanRequest {
  goalTitle: string;
  context?: string;          // เช่น cards ที่มีอยู่, ระยะเวลา
  model?: string;            // default 'gemini-2.5-flash'
}
```

**Mode A — Direct (ยิงจาก client ตรง):** ใช้ `@google/genai` ในเบราว์เซอร์ด้วย key ของผู้ใช้ — key ไม่แตะ backend เลย เหมาะถ้า CORS ผ่านในสภาพแวดล้อมของคุณ

```typescript
// apps/web/lib/ai/direct-provider.ts
import { GoogleGenAI } from '@google/genai';

export class DirectGeminiProvider implements AIProvider {
  constructor(private apiKey: string) {}

  async generatePlan(input: PlanRequest): Promise<PlanSuggestion> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });
    const res = await ai.models.generateContent({
      model: input.model ?? 'gemini-2.5-flash',
      contents: buildPrompt(input),
      // ขอผลลัพธ์เป็น JSON ที่ parse ได้ตรงกับ schema ของเรา
      config: { responseMimeType: 'application/json' },
    });
    return parsePlan(res.text); // validate ด้วย zod
  }
}
```

**Mode B — Thin proxy (กัน CORS, ไม่เก็บ key):** ส่ง key มากับ header ของ request, backend forward ไป Gemini แล้วคืนผล — **ไม่ persist, ไม่ log key** เด็ดขาด เป็น stateless pass-through

```typescript
// apps/api: POST /ai/proxy/generate
// อ่าน key จาก header 'x-user-gemini-key' (ห้าม log header นี้)
@Post('proxy/generate')
async proxy(@Headers('x-user-gemini-key') key: string, @Body() body: ProxyDto) {
  if (!key) throw new BadRequestException('missing key header');
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body.payload),
    },
  );
  return r.json(); // key อยู่แค่ใน scope ของ request นี้ จบแล้วหายไป
}
```

> ใช้ header `x-goog-api-key` แทนการต่อ `?key=` ท้าย URL เพื่อไม่ให้ key ไปโผล่ใน URL/log

### 6.3 การเก็บ key ฝั่ง client (สำคัญต่อความปลอดภัย)

- **default: เก็บใน memory (Zustand แบบไม่ persist)** — รีเฟรชหน้าแล้วต้องใส่ใหม่ ปลอดภัยสุด
- ถ้าผู้ใช้กด "จำไว้ในเครื่องนี้" → เก็บใน `sessionStorage` (หายเมื่อปิดแท็บ) พร้อมเตือน ไม่แนะนำ `localStorage` เพราะค้างถาวรและโดน XSS ดึงได้
- **ป้องกัน XSS เข้มงวด** เพราะ key อยู่ในเบราว์เซอร์:
  - React escape ให้อยู่แล้ว — **ห้าม** `dangerouslySetInnerHTML` กับผลลัพธ์จาก AI โดยไม่ผ่าน sanitize (ใช้ DOMPurify ถ้าต้อง render markdown)
  - ตั้ง **strict Content-Security-Policy** จำกัด script source และ connect-src (อนุญาตเฉพาะ API ตัวเอง + `generativelanguage.googleapis.com`)
- แนะนำผู้ใช้ตั้ง **API key restriction (HTTP referrer)** ใน Google AI Studio ให้จำกัดเฉพาะโดเมนของแอป
- ห้าม log key ทุกที่ ระวัง analytics/error reporter ที่เก็บ full URL หรือ request header

### 6.4 Flow การวางแผนด้วย AI

```mermaid
sequenceDiagram
  actor U as User
  participant FE as Next.js (AI panel)
  participant BE as NestJS API
  participant G as Gemini API

  U->>FE: "แตกเป้าหมายนี้เป็นแผนรายสัปดาห์"
  FE->>BE: GET /goals/:id (ดึง context)
  BE-->>FE: goal + cards ปัจจุบัน
  Note over FE,G: Mode A = ยิงตรง / Mode B = ผ่าน proxy
  FE->>G: generateContent (key ของ user, responseMimeType=json)
  G-->>FE: JSON รายการ card + วันที่ที่แนะนำ
  FE->>FE: validate ด้วย zod + แสดงให้ผู้ใช้รีวิว
  U->>FE: กด "ยอมรับ"
  FE->>BE: POST /goals/:id/apply-plan (bulk create)
  BE->>BE: สร้าง cards/milestones ใน transaction เดียว
  BE-->>FE: cards ที่สร้างแล้ว
```

จุดสำคัญ: **AI สร้างได้แค่ "ข้อเสนอ" ผู้ใช้ต้องกดยอมรับก่อนถึงบันทึก** ผ่าน endpoint ปกติ → backend เป็นแหล่งความจริงเสมอ, ผลจาก AI ถูก validate ก่อนเข้าระบบ

### 6.5 จัดการโควต้า/error ของผู้ใช้

- เป็นโควต้าฟรีของผู้ใช้ → ต้องรับมือ **429 (rate limit)** อย่างนุ่มนวล: แสดงข้อความว่าโควต้าหมด/ถึงลิมิต ให้ลองใหม่ภายหลัง ไม่ retry รัวๆ
- มี timeout + ปุ่มยกเลิก, แสดง loading state ระหว่างรอ

---

## 7. ส่วนที่ 2 — Backend (NestJS) + API design

### 7.1 โครงสร้าง module

```
apps/api/src/
  auth/            # register, login, refresh, JWT guard, argon2
  users/
  goals/
  boards/
  columns/
  cards/
  labels/
  milestones/
  ai/              # thin proxy (Mode B) + apply-plan helper
  common/          # guards, interceptors, filters, zod validation pipe
  prisma/          # PrismaService
  main.ts          # helmet, cors, throttler, global pipes
```

### 7.2 REST API (เวอร์ชัน `/api/v1`)

ทุก endpoint (ยกเว้น auth/register, auth/login, auth/refresh) ต้องมี JWT access token. ทุก resource ถูก scope ด้วย `user_id` ของ token เสมอ — ผู้ใช้เห็นได้แค่ข้อมูลตัวเอง

| Method | Path | คำอธิบาย | Auth |
|---|---|---|---|
| POST | `/auth/register` | สมัคร (email, password, displayName) | – |
| POST | `/auth/login` | ล็อกอิน → access token + ตั้ง refresh cookie | – |
| POST | `/auth/refresh` | ออก access token ใหม่จาก refresh cookie | cookie |
| POST | `/auth/logout` | revoke refresh token | ✓ |
| GET | `/auth/me` | ข้อมูลผู้ใช้ปัจจุบัน | ✓ |
| GET | `/goals` | list goals (filter `?status=`) | ✓ |
| POST | `/goals` | สร้าง goal | ✓ |
| GET | `/goals/:id` | goal + boards/milestones ที่ผูก | ✓ |
| PATCH | `/goals/:id` | แก้ไข (title, status, targetDate, progress) | ✓ |
| DELETE | `/goals/:id` | ลบ goal | ✓ |
| POST | `/goals/:id/apply-plan` | สร้าง cards/milestones จากแผน AI (bulk, transaction) | ✓ |
| GET | `/boards` | list boards (`?goalId=`) | ✓ |
| POST | `/boards` | สร้าง board | ✓ |
| GET | `/boards/:id` | board + columns + cards (nested) | ✓ |
| PATCH | `/boards/:id` | แก้ไข board | ✓ |
| DELETE | `/boards/:id` | ลบ board | ✓ |
| POST | `/boards/:boardId/columns` | เพิ่มคอลัมน์ | ✓ |
| PATCH | `/columns/:id` | แก้ชื่อ/wipLimit/position | ✓ |
| DELETE | `/columns/:id` | ลบคอลัมน์ | ✓ |
| POST | `/columns/:columnId/cards` | สร้าง card | ✓ |
| GET | `/cards/:id` | รายละเอียด card | ✓ |
| PATCH | `/cards/:id` | แก้ไข card | ✓ |
| PATCH | `/cards/:id/move` | ย้าย/เรียง (columnId + position ใหม่) | ✓ |
| DELETE | `/cards/:id` | ลบ card | ✓ |
| GET | `/labels` · POST · PATCH · DELETE | จัดการ label | ✓ |
| GET | `/timeline` | รวม milestones + cards ที่มี due_date (`?from=&to=&goalId=`) | ✓ |
| POST | `/milestones` · PATCH · DELETE | จัดการ milestone | ✓ |
| POST | `/ai/proxy/generate` | thin proxy ไป Gemini (Mode B, ไม่เก็บ key) | ✓ |

### 7.3 มาตรฐาน API

- **Error format**: ใช้รูปแบบสม่ำเสมอ `{ "error": { "code": "...", "message": "...", "details": [...] } }` (อิง problem+json) — status code ตามมาตรฐาน (400/401/403/404/409/422/429/500)
- **Validation**: ทุก body/query ผ่าน zod validation pipe (schema มาจาก `packages/shared`)
- **Pagination**: list endpoint รองรับ `?limit=&cursor=` (cursor-based)
- **Rate limit**: `@nestjs/throttler` (เช่น 100 req/นาที/IP) — กัน abuse
- **Security middleware**: `helmet`, CORS จำกัดเฉพาะ origin ของ frontend, body size limit
- **Logging**: `pino` (structured) — **กรอง field ที่ sensitive (header `x-user-gemini-key`, password) ออกจาก log**

---

## 8. Dev workflow (พัฒนา)

### 8.1 Monorepo (pnpm + Turborepo)

```
study-planner/
  apps/
    web/                 # Next.js
    api/                 # NestJS
  packages/
    shared/              # zod schemas + types ใช้ร่วม FE/BE  ← สำคัญ
    tsconfig/            # base tsconfig
    eslint-config/       # shared lint rules
  docker-compose.yml     # postgres สำหรับ dev
  turbo.json
  pnpm-workspace.yaml
```

`packages/shared` คือกาวที่ทำให้ type ตรงกันทั้งสองฝั่ง — นิยาม schema ของ Goal/Board/Card ที่นี่ที่เดียว ใช้ validate ที่ BE และ infer type ที่ FE

### 8.2 ตั้ง environment local

```bash
# 1. ฐานข้อมูล
docker compose up -d            # postgres :5432

# 2. ติดตั้ง deps ทั้ง monorepo
pnpm install

# 3. ตั้งค่า env (คัดลอกจาก .env.example)
#    apps/api/.env  -> DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#    apps/web/.env  -> NEXT_PUBLIC_API_URL

# 4. รัน migration + seed
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed

# 5. รันทั้ง FE + BE พร้อมกัน (turbo)
pnpm dev
```

ตัวอย่าง `docker-compose.yml` (dev):

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: studyplanner
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes: { pgdata: {} }
```

### 8.3 Migration discipline

- แก้ schema ทุกครั้ง → `prisma migrate dev --name <ชื่อ>` → commit ไฟล์ migration เข้า git
- **ห้าม** แก้ DB ด้วยมือใน production — production ใช้ `prisma migrate deploy` ผ่าน CI เท่านั้น

---

## 9. Testing strategy (ทดสอบ)

ปิรามิดการทดสอบ: unit เยอะสุด → integration → e2e น้อยสุด

| ระดับ | ขอบเขต | เครื่องมือ |
|---|---|---|
| Unit (BE) | service/business logic, fractional ranking, plan parser | Jest |
| Integration (BE) | controller + DB จริง (ผ่าน test Postgres) | Jest + supertest + Testcontainers |
| Unit/Component (FE) | component, hooks, zod schema | Vitest + React Testing Library |
| E2E | flow จริงผ่าน browser (login → สร้าง goal → ลาก card) | Playwright |
| Contract | request/response ตรงกับ zod schema ใน shared | Vitest |

หลักการ:
- ใช้ **Postgres จริงในเทสต์** (Testcontainers หรือ service container ใน CI) ไม่ใช้ mock DB — เพราะ logic หลายอย่างพึ่ง constraint/cascade ของ DB
- E2E mock การเรียก Gemini (ไม่ยิง API จริงในเทสต์) เพื่อให้ deterministic
- ตั้ง coverage threshold (เช่น 70% สำหรับ service layer) ใน CI

---

## 10. Deploy & CI/CD

### 10.1 เป้าหมายการ deploy (เหมาะกับหลักพันคน)

| ชั้น | แนะนำ | หมายเหตุ |
|---|---|---|
| Frontend (Next.js) | **Vercel** | native กับ Next.js, preview deploy ต่อ PR |
| Backend (NestJS) | **Fly.io** หรือ **Render** (Docker) | autoscale พอประมาณ, ราคาเริ่มต้นถูก |
| Database | **Neon** (serverless Postgres) หรือ Supabase | Neon มี branching ทำ preview DB ต่อ PR ได้ |
| Object storage (avatar) | Cloudflare R2 / S3 | optional |
| Observability | Sentry (FE+BE) + uptime monitor | error tracking + alert |

3 environment: **local → staging → production** — staging ใช้ DB/secret แยกจาก production

### 10.2 Dockerfile (backend, multi-stage)

```dockerfile
# apps/api/Dockerfile
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api prisma generate
RUN pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/prisma ./prisma
EXPOSE 3000
# รัน migration ก่อนสตาร์ท (หรือทำใน CI step แยก — ดู 10.4)
CMD ["sh", "-c", "node dist/main.js"]
```

### 10.3 GitHub Actions — CI (รันทุก PR)

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push: { branches: [main] }

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: test, POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U test" --health-interval 5s
          --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/test
      JWT_ACCESS_SECRET: test-access
      JWT_REFRESH_SECRET: test-refresh
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter api prisma migrate deploy
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test            # vitest + jest ทั้ง monorepo
      - run: pnpm build
```

### 10.4 GitHub Actions — Deploy (merge เข้า main)

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push: { branches: [main] }

jobs:
  migrate-and-deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      # 1) รัน migration ใส่ production DB ก่อน deploy โค้ดใหม่
      - run: pnpm --filter api prisma migrate deploy
        env: { DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }} }
      # 2) deploy backend (ตัวอย่าง Fly.io)
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }
  # frontend: Vercel auto-deploy จาก git integration (ไม่ต้องเขียน job)
```

ลำดับสำคัญ: **migrate ก่อน deploy โค้ด** — เขียน migration ให้ backward-compatible (เช่น เพิ่มคอลัมน์แบบ nullable ก่อน, ค่อย backfill, ค่อยบังคับ not-null ใน migration ถัดไป) เพื่อให้โค้ดเก่า/ใหม่อยู่ร่วมกันได้ช่วง rollout

### 10.5 Secrets

เก็บใน GitHub Actions secrets + env ของ platform: `PROD_DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SENTRY_DSN` ฯลฯ — **ไม่มี Gemini key ฝั่ง server** (เป็นของผู้ใช้)

---

## 11. Security checklist

- [ ] HTTPS ทุกที่ + HSTS
- [ ] Password hash ด้วย **argon2** (หรือ bcrypt)
- [ ] JWT access อายุสั้น (~15 นาที) เก็บใน memory; refresh ใน **httpOnly + Secure + SameSite** cookie + token rotation
- [ ] CORS จำกัดเฉพาะ origin ของ frontend
- [ ] Validate ทุก input ด้วย zod/class-validator
- [ ] Rate limiting (throttler) ทุก endpoint
- [ ] `helmet` + strict **CSP** (จำกัด `connect-src` เฉพาะ API ตัวเอง + Gemini)
- [ ] ทุก query scope ด้วย `user_id` — กันการเข้าถึงข้อมูลคนอื่น (IDOR)
- [ ] **Gemini key อยู่ฝั่ง client เท่านั้น** (memory/sessionStorage), ไม่เก็บใน DB, ไม่ log; โหมด proxy ก็ pass-through ไม่ persist
- [ ] ไม่ render ผลจาก AI เป็น HTML ดิบ (กัน XSS) — sanitize ถ้าต้อง
- [ ] กรอง sensitive fields ออกจาก log และ error reporter
- [ ] แนะนำผู้ใช้ตั้ง API key restriction (HTTP referrer) ใน Google AI Studio

---

## 12. ลำดับการสร้าง (suggested roadmap)

1. **Phase 0 — Setup**: monorepo, docker-compose, Prisma schema + migration แรก, CI skeleton
2. **Phase 1 — Auth**: register/login/refresh + JWT guard + เทสต์
3. **Phase 2 — Core CRUD**: goals, boards, columns, cards + FE list/detail
4. **Phase 3 — Board UX**: dnd-kit + fractional ranking + optimistic update
5. **Phase 4 — Timeline + milestones**
6. **Phase 5 — AI assistant**: AIProvider interface → Direct mode ก่อน → เพิ่ม proxy mode + apply-plan
7. **Phase 6 — Hardening**: rate limit, CSP, Sentry, e2e Playwright, staging
8. **Phase 7 — Launch**: production deploy, monitoring, backup ของ DB

---

*หมายเหตุ: ชื่อ model ของ Gemini (`gemini-2.5-flash`, `gemini-3.5-flash`) และนโยบาย client-side ของ Google เปลี่ยนได้ ควรเช็ค `ai.google.dev/gemini-api/docs` ก่อนเริ่ม และทำ model เป็นค่า config ไม่ hardcode*
