CREATE TYPE "public"."angle_joint" AS ENUM('knee', 'hip', 'elbow', 'trunk');--> statement-breakpoint
CREATE TABLE "angle_measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"frame" integer NOT NULL,
	"rower_id" uuid NOT NULL,
	"joint" "angle_joint" NOT NULL,
	"points" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "angle_measure_unique" UNIQUE("video_id","frame","rower_id","joint"),
	CONSTRAINT "angle_measure_frame_check" CHECK ("angle_measure"."frame" >= 0)
);
--> statement-breakpoint
ALTER TABLE "angle_measure" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "video_boat_line" (
	"club_id" uuid NOT NULL,
	"video_id" uuid PRIMARY KEY NOT NULL,
	"points" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "video_boat_line" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "angle_measure" ADD CONSTRAINT "angle_measure_video_fk" FOREIGN KEY ("club_id","video_id") REFERENCES "public"."video"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "angle_measure" ADD CONSTRAINT "angle_measure_rower_fk" FOREIGN KEY ("club_id","rower_id") REFERENCES "public"."rower"("club_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_boat_line" ADD CONSTRAINT "video_boat_line_video_fk" FOREIGN KEY ("club_id","video_id") REFERENCES "public"."video"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "angle_measure_rower_idx" ON "angle_measure" USING btree ("rower_id");--> statement-breakpoint
CREATE POLICY "angle_measure_tenant" ON "angle_measure" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("angle_measure"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("angle_measure"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "angle_measure_role_read" ON "angle_measure" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_video("angle_measure"."video_id"));--> statement-breakpoint
CREATE POLICY "angle_measure_role_add" ON "angle_measure" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_sees_all() or rowlens_coaches_video("angle_measure"."video_id"));--> statement-breakpoint
CREATE POLICY "angle_measure_role_edit" ON "angle_measure" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_sees_all() or rowlens_coaches_video("angle_measure"."video_id")) WITH CHECK (rowlens_sees_all() or rowlens_coaches_video("angle_measure"."video_id"));--> statement-breakpoint
CREATE POLICY "angle_measure_role_delete" ON "angle_measure" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_sees_all() or rowlens_coaches_video("angle_measure"."video_id"));--> statement-breakpoint
CREATE POLICY "video_boat_line_tenant" ON "video_boat_line" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("video_boat_line"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("video_boat_line"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "video_boat_line_role_read" ON "video_boat_line" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_video("video_boat_line"."video_id"));--> statement-breakpoint
CREATE POLICY "video_boat_line_role_add" ON "video_boat_line" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_sees_all() or rowlens_coaches_video("video_boat_line"."video_id"));--> statement-breakpoint
CREATE POLICY "video_boat_line_role_edit" ON "video_boat_line" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_sees_all() or rowlens_coaches_video("video_boat_line"."video_id")) WITH CHECK (rowlens_sees_all() or rowlens_coaches_video("video_boat_line"."video_id"));--> statement-breakpoint
CREATE POLICY "video_boat_line_role_delete" ON "video_boat_line" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_sees_all() or rowlens_coaches_video("video_boat_line"."video_id"));--> statement-breakpoint
-- Merging two roster entries (#104) moves their angle measurements too (ADR-0017), also those in
-- sessions the merging member can't see (their role policies would skip those rows and the rower's
-- key would then block the merge). Only within the current club, only between two of its rowers.
CREATE FUNCTION rowlens_merge_angle_measures(p_from uuid, p_into uuid) RETURNS void
	LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
	DECLARE
		v_club uuid := nullif(current_setting('app.club_id', true), '')::uuid;
	BEGIN
		IF v_club IS NULL OR p_from = p_into OR (
			SELECT count(*) FROM rower WHERE club_id = v_club AND id IN (p_from, p_into)
		) <> 2 THEN
			RAISE EXCEPTION 'rowlens_merge_angle_measures: rowers not in this club';
		END IF;
		-- Where both measured the same joint on the same frame, the kept rower's measurement stays.
		DELETE FROM angle_measure AS a
			WHERE a.club_id = v_club AND a.rower_id = p_from AND EXISTS (
				SELECT 1 FROM angle_measure AS b
				WHERE b.rower_id = p_into AND b.video_id = a.video_id
					AND b.frame = a.frame AND b.joint = a.joint
			);
		UPDATE angle_measure SET rower_id = p_into, updated_at = now()
			WHERE club_id = v_club AND rower_id = p_from;
	END
	$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_merge_angle_measures(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_merge_angle_measures(uuid, uuid) TO rowlens_app;
