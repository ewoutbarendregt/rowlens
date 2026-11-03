-- The boat line found in every frame by the worker (ADR-0018).
CREATE TABLE "video_auto_boat_line" (
	"video_id" uuid PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"frames" jsonb,
	"detector" text,
	"computed_at" timestamp with time zone,
	"bow_side" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_auto_boat_line_status_check" CHECK ("video_auto_boat_line"."status" in ('queued', 'running', 'done', 'failed')),
	CONSTRAINT "video_auto_boat_line_bow_side_check" CHECK ("video_auto_boat_line"."bow_side" in ('left', 'right'))
);
--> statement-breakpoint
ALTER TABLE "video_auto_boat_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_auto_boat_line" ADD CONSTRAINT "video_auto_boat_line_video_fk" FOREIGN KEY ("club_id","video_id") REFERENCES "public"."video"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "video_auto_boat_line_tenant" ON "video_auto_boat_line" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("video_auto_boat_line"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("video_auto_boat_line"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "video_auto_boat_line_role_read" ON "video_auto_boat_line" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_video("video_auto_boat_line"."video_id"));--> statement-breakpoint
CREATE POLICY "video_auto_boat_line_role_add" ON "video_auto_boat_line" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_sees_all() or rowlens_coaches_video("video_auto_boat_line"."video_id"));--> statement-breakpoint
CREATE POLICY "video_auto_boat_line_role_edit" ON "video_auto_boat_line" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_sees_all() or rowlens_coaches_video("video_auto_boat_line"."video_id")) WITH CHECK (rowlens_sees_all() or rowlens_coaches_video("video_auto_boat_line"."video_id"));--> statement-breakpoint
-- Every video that is already ready gets its boat lines found once (ADR-0018); new ones are queued
-- by the worker when processing finishes.
INSERT INTO "job" ("club_id", "type", "payload", "idempotency_key")
	SELECT "club_id", 'video.boat_line', jsonb_build_object('videoId', "id"), 'video.boat_line:' || "id"
	FROM "video" WHERE "status" = 'ready'
	ON CONFLICT ("idempotency_key") DO NOTHING;
