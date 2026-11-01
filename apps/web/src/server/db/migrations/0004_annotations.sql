CREATE TYPE "public"."annotation_kind" AS ENUM('note', 'line', 'arrow', 'angle');--> statement-breakpoint
CREATE TABLE "annotation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"frame" integer NOT NULL,
	"kind" "annotation_kind" DEFAULT 'note' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"shape" jsonb,
	"author_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "annotation_frame_check" CHECK ("annotation"."frame" >= 0),
	CONSTRAINT "annotation_body_check" CHECK (char_length("annotation"."body") <= 2000),
	CONSTRAINT "annotation_author_check" CHECK (char_length("annotation"."author_name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "annotation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- The foreign key below needs this key to exist first (drizzle-kit orders it after).
ALTER TABLE "video" ADD CONSTRAINT "video_club_id_id_unique" UNIQUE("club_id","id");--> statement-breakpoint
ALTER TABLE "annotation" ADD CONSTRAINT "annotation_video_fk" FOREIGN KEY ("club_id","video_id") REFERENCES "public"."video"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotation_video_frame_idx" ON "annotation" USING btree ("video_id","frame");--> statement-breakpoint
CREATE POLICY "annotation_tenant" ON "annotation" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("annotation"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("annotation"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);