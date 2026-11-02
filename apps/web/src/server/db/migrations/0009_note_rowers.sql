CREATE TYPE "public"."moment_rower_action" AS ENUM('assigned', 'unassigned');--> statement-breakpoint
CREATE TABLE "moment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"frame" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moment_video_frame_unique" UNIQUE("video_id","frame"),
	CONSTRAINT "moment_club_id_id_unique" UNIQUE("club_id","id"),
	CONSTRAINT "moment_frame_check" CHECK ("moment"."frame" >= 0)
);
--> statement-breakpoint
ALTER TABLE "moment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moment_rower" (
	"club_id" uuid NOT NULL,
	"moment_id" uuid NOT NULL,
	"rower_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_user_id" uuid,
	CONSTRAINT "moment_rower_pk" PRIMARY KEY("moment_id","rower_id")
);
--> statement-breakpoint
ALTER TABLE "moment_rower" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "moment_rower_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"moment_id" uuid NOT NULL,
	"rower_id" uuid NOT NULL,
	"action" "moment_rower_action" NOT NULL,
	"by_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moment_rower_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "moment" ADD CONSTRAINT "moment_video_fk" FOREIGN KEY ("club_id","video_id") REFERENCES "public"."video"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_rower" ADD CONSTRAINT "moment_rower_moment_fk" FOREIGN KEY ("club_id","moment_id") REFERENCES "public"."moment"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_rower" ADD CONSTRAINT "moment_rower_rower_fk" FOREIGN KEY ("club_id","rower_id") REFERENCES "public"."rower"("club_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_rower_log" ADD CONSTRAINT "moment_rower_log_moment_fk" FOREIGN KEY ("club_id","moment_id") REFERENCES "public"."moment"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moment_rower_rower_idx" ON "moment_rower" USING btree ("rower_id");--> statement-breakpoint
CREATE INDEX "moment_rower_log_moment_idx" ON "moment_rower_log" USING btree ("moment_id","at");--> statement-breakpoint
CREATE POLICY "moment_tenant" ON "moment" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("moment"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("moment"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "moment_rower_tenant" ON "moment_rower" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("moment_rower"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("moment_rower"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "moment_rower_log_tenant" ON "moment_rower_log" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("moment_rower_log"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("moment_rower_log"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);