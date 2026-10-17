ALTER TABLE "spaces" ADD COLUMN "divisions" smallint[] DEFAULT '{}'::smallint[] NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "part_count" smallint;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "part_index" smallint;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_parent_id_spaces_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."spaces"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_part_key" UNIQUE("parent_id","part_count","part_index");--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_part_shape" CHECK (("spaces"."parent_id" IS NULL AND "spaces"."part_count" IS NULL AND "spaces"."part_index" IS NULL)
        OR ("spaces"."parent_id" IS NOT NULL AND "spaces"."part_count" BETWEEN 2 AND 4
          AND "spaces"."part_index" BETWEEN 1 AND "spaces"."part_count"
          AND "spaces"."divisions" = '{}'::smallint[]));--> statement-breakpoint
-- Club defaults (ADR 0016): campo 2 whole, halves or thirds; campo 3 whole or halves; campo 1
-- whole only. The old "Campo 2+3" combination is replaced by these and kept only as history.
UPDATE "spaces" SET "divisions" = '{2,3}' WHERE "kind" = 'field' AND "parent_id" IS NULL AND lower("name") = 'campo 2';--> statement-breakpoint
UPDATE "spaces" SET "divisions" = '{2}' WHERE "kind" = 'field' AND "parent_id" IS NULL AND lower("name") = 'campo 3';--> statement-breakpoint
UPDATE "spaces" SET "active" = false WHERE "kind" = 'field' AND "parent_id" IS NULL AND lower("name") = 'campo 2+3';--> statement-breakpoint
INSERT INTO "spaces" ("venue_id", "name", "kind", "capacity", "active", "parent_id", "part_count", "part_index")
SELECT p."venue_id",
  p."name" || ' · ' || CASE d.n
    WHEN 2 THEN 'Metade ' || chr(64 + i.i)
    WHEN 3 THEN 'Terço ' || i.i
    ELSE 'Quarto ' || i.i END,
  p."kind", p."capacity", p."active", p."id", d.n, i.i
FROM "spaces" p
CROSS JOIN LATERAL unnest(p."divisions") AS d(n)
CROSS JOIN LATERAL generate_series(1, d.n) AS i(i)
WHERE p."parent_id" IS NULL AND cardinality(p."divisions") > 0;
