CREATE TABLE "rower" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rower_club_id_id_unique" UNIQUE("club_id","id"),
	CONSTRAINT "rower_club_email_unique" UNIQUE("club_id","email"),
	CONSTRAINT "rower_club_user_unique" UNIQUE("club_id","user_id"),
	CONSTRAINT "rower_name_check" CHECK (char_length("rower"."display_name") between 1 and 60),
	CONSTRAINT "rower_email_check" CHECK ("rower"."email" = lower("rower"."email") and "rower"."email" like '%_@_%')
);
--> statement-breakpoint
ALTER TABLE "rower" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rower" ADD CONSTRAINT "rower_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rower" ADD CONSTRAINT "rower_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "rower_tenant" ON "rower" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("rower"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("rower"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);