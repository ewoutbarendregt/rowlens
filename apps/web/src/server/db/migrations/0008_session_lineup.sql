CREATE TABLE "lineup_seat" (
	"club_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"seat" smallint NOT NULL,
	"rower_id" uuid NOT NULL,
	CONSTRAINT "lineup_seat_pk" PRIMARY KEY("session_id","seat"),
	CONSTRAINT "lineup_seat_session_rower_unique" UNIQUE("session_id","rower_id"),
	CONSTRAINT "lineup_seat_seat_check" CHECK ("lineup_seat"."seat" between 0 and 8)
);
--> statement-breakpoint
ALTER TABLE "lineup_seat" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rowing_session" ADD COLUMN "boat_type" text;--> statement-breakpoint
ALTER TABLE "lineup_seat" ADD CONSTRAINT "lineup_seat_session_fk" FOREIGN KEY ("club_id","session_id") REFERENCES "public"."rowing_session"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_seat" ADD CONSTRAINT "lineup_seat_rower_fk" FOREIGN KEY ("club_id","rower_id") REFERENCES "public"."rower"("club_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lineup_seat_rower_idx" ON "lineup_seat" USING btree ("rower_id");--> statement-breakpoint
ALTER TABLE "rowing_session" ADD CONSTRAINT "rowing_session_boat_type_check" CHECK (boat_type in ('C1x', 'C2x', 'C2x+', 'C4x+', 'C4+', '1x', '2x', '2-', '2+', '4x', '4-', '4+', '4x+', '8+'));--> statement-breakpoint
CREATE POLICY "lineup_seat_tenant" ON "lineup_seat" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("lineup_seat"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("lineup_seat"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);