ALTER TABLE "rooms" ADD COLUMN "layout" jsonb;
UPDATE "rooms"
SET "layout" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('benches', "rooms"."bench_columns") ORDER BY series)
  FROM generate_series(1, "rooms"."bench_rows") AS series
), '[]'::jsonb);
ALTER TABLE "rooms" ALTER COLUMN "layout" SET DEFAULT '[]'::jsonb;
ALTER TABLE "rooms" ALTER COLUMN "layout" SET NOT NULL;
ALTER TABLE "rooms" DROP COLUMN "bench_rows";
ALTER TABLE "rooms" DROP COLUMN "bench_columns";
