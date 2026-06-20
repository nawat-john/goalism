-- Fractional-indexing keys (LexoRank) sort by byte value ('0'-'9' < 'A'-'Z' < 'a'-'z'),
-- but this database's default collation (en_US.utf8) sorts case-insensitively, so
-- `ORDER BY position` could disagree with the key order the app computed (e.g. it
-- placed "Zz" before "a0", but Postgres ORDER BY put "a0" first). Force byte-order
-- ("C") collation on every position column so DB order always matches key order.
ALTER TABLE "boards" ALTER COLUMN "position" TYPE text COLLATE "C";
ALTER TABLE "board_columns" ALTER COLUMN "position" TYPE text COLLATE "C";
ALTER TABLE "cards" ALTER COLUMN "position" TYPE text COLLATE "C";
