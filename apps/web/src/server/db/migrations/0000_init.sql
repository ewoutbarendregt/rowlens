CREATE TABLE "club" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "club" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "club_read_own" ON "club" AS PERMISSIVE FOR SELECT TO "rowlens_app" USING ("club"."id" = nullif(current_setting('app.club_id', true), '')::uuid);