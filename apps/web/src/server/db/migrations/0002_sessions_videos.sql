CREATE TYPE "public"."video_perspective" AS ENUM('boat', 'bank', 'drone');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('uploading', 'uploaded', 'processing', 'ready', 'failed', 'rejected');--> statement-breakpoint
CREATE TABLE "rowing_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"title" text NOT NULL,
	"session_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rowing_session_club_id_id_unique" UNIQUE("club_id","id")
);
--> statement-breakpoint
ALTER TABLE "rowing_session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "video" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"perspective" "video_perspective" NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_bytes" bigint DEFAULT 0 NOT NULL,
	"status" "video_status" DEFAULT 'uploading' NOT NULL,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rowing_session" ADD CONSTRAINT "rowing_session_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_session_fk" FOREIGN KEY ("club_id","session_id") REFERENCES "public"."rowing_session"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rowing_session_club_date_idx" ON "rowing_session" USING btree ("club_id","session_date");--> statement-breakpoint
CREATE INDEX "video_session_idx" ON "video" USING btree ("session_id");--> statement-breakpoint
CREATE POLICY "rowing_session_tenant" ON "rowing_session" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("rowing_session"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("rowing_session"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "video_tenant" ON "video" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("video"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("video"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
-- Bytes reserved by all clubs' videos, for the global media cap (ADR-0006). RLS shows the app one
-- club only, so this SECURITY DEFINER function returns just the total, nothing per club.
CREATE FUNCTION rowlens_media_bytes() RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT coalesce(sum(size_bytes), 0)::bigint FROM video WHERE status <> 'rejected' $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_media_bytes() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_media_bytes() TO rowlens_app;
