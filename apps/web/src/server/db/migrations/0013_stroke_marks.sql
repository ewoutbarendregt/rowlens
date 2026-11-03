CREATE TYPE "public"."stroke_mark_kind" AS ENUM('catch', 'half_slide', 'finish');--> statement-breakpoint
CREATE TABLE "stroke_mark" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"frame" integer NOT NULL,
	"kind" "stroke_mark_kind" NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stroke_mark_video_frame_unique" UNIQUE("video_id","frame"),
	CONSTRAINT "stroke_mark_frame_check" CHECK ("stroke_mark"."frame" >= 0)
);
--> statement-breakpoint
ALTER TABLE "stroke_mark" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stroke_mark" ADD CONSTRAINT "stroke_mark_video_fk" FOREIGN KEY ("club_id","video_id") REFERENCES "public"."video"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "stroke_mark_tenant" ON "stroke_mark" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("stroke_mark"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("stroke_mark"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "stroke_mark_role_read" ON "stroke_mark" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_video("stroke_mark"."video_id"));--> statement-breakpoint
CREATE POLICY "stroke_mark_role_add" ON "stroke_mark" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_sees_all() or rowlens_coaches_video("stroke_mark"."video_id"));--> statement-breakpoint
CREATE POLICY "stroke_mark_role_edit" ON "stroke_mark" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_sees_all() or rowlens_coaches_video("stroke_mark"."video_id")) WITH CHECK (rowlens_sees_all() or rowlens_coaches_video("stroke_mark"."video_id"));--> statement-breakpoint
CREATE POLICY "stroke_mark_role_delete" ON "stroke_mark" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_sees_all() or rowlens_coaches_video("stroke_mark"."video_id"));