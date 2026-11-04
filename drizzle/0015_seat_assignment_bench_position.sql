ALTER TABLE "seat_assignments" ADD COLUMN "bench_position" text;
UPDATE "seat_assignments"
SET "bench_position" = CASE
  WHEN "bench_slot" = 1 THEN 'left'
  WHEN "bench_slot" = 2 THEN 'right'
  ELSE NULL
END;
