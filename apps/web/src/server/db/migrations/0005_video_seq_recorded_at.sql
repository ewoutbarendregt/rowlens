ALTER TABLE "video" ADD COLUMN "seq" integer;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_session_seq_unique" UNIQUE("session_id","seq");--> statement-breakpoint
-- Number the videos that already exist, per session in upload order.
UPDATE "video" AS v SET "seq" = n.rn
  FROM (SELECT "id", row_number() OVER (PARTITION BY "session_id" ORDER BY "created_at", "id") AS rn FROM "video") AS n
 WHERE v."id" = n."id";
