ALTER TABLE "app_user" ADD COLUMN "primary_club_id" uuid;--> statement-breakpoint
ALTER TABLE "rowing_session" ADD COLUMN "is_example" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_primary_club_id_club_id_fk" FOREIGN KEY ("primary_club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Narrow authenticated example scope; every read rechecks classification and active club.
CREATE FUNCTION rowlens_example_session(p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_session=nullif(current_setting('app.example_session',true),'')::uuid
 AND EXISTS(SELECT 1 FROM app_user WHERE id=rowlens_user_id() AND verified_at IS NOT NULL)
 AND EXISTS(SELECT 1 FROM rowing_session s JOIN club c ON c.id=s.club_id
 WHERE s.id=p_session AND s.is_example AND c.archived_at IS NULL
 AND s.club_id=nullif(current_setting('app.club_id',true),'')::uuid)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_example_video(p_video uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM video v WHERE v.id=p_video
 AND v.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_example_session(v.session_id))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_example_rower(p_rower uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM lineup_seat ls WHERE ls.rower_id=p_rower
 AND ls.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_example_session(ls.session_id))
$$;
--> statement-breakpoint
-- Only IDs and owning clubs cross the discovery boundary; content still goes through tenant RLS.
CREATE FUNCTION rowlens_examples() RETURNS TABLE(id uuid,club_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT s.id,s.club_id FROM rowing_session s JOIN club c ON c.id=s.club_id
 WHERE s.is_example AND c.archived_at IS NULL
 AND EXISTS(SELECT 1 FROM app_user WHERE id=rowlens_user_id() AND verified_at IS NOT NULL)
 ORDER BY s.session_date DESC,s.created_at DESC,s.id DESC
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_can_read_training_row(p_session uuid,p_creator uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN nullif(current_setting('app.example_session',true),'') IS NOT NULL
 THEN rowlens_example_session(p_session)
 ELSE rowlens_can_read_trainings() AND (rowlens_roster_manager() OR p_creator=rowlens_user_id()
 OR EXISTS(SELECT 1 FROM lineup_seat ls JOIN rower r ON r.id=ls.rower_id AND r.club_id=ls.club_id
 WHERE ls.session_id=p_session AND ls.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND (r.user_id=rowlens_user_id() OR ls.account_user_id=rowlens_user_id())))
 AND (current_setting('app.training_permissions',true)='owner-or-staff' OR rowlens_sees_all()
 OR p_creator=rowlens_user_id() OR rowlens_session_reachable(p_session)) END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_can_see_session(p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM rowing_session s WHERE s.id=p_session
 AND s.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND rowlens_can_read_training_row(s.id,s.created_by_user_id))
$$;
--> statement-breakpoint
-- Example requests have no role capabilities, even if their viewer is a platform administrator.
CREATE OR REPLACE FUNCTION rowlens_has_role(p_role text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT nullif(current_setting('app.example_session',true),'') IS NULL AND
 ((p_role='admin' AND rowlens_platform_admin()) OR coalesce(nullif(current_setting('app.roles',true),'')::jsonb ? p_role,false))
$$;
--> statement-breakpoint
UPDATE rowing_session SET is_example=true WHERE created_by_user_id IN (SELECT user_id FROM platform_admin);
--> statement-breakpoint
CREATE FUNCTION rowlens_stamp_example() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
 NEW.is_example:=rowlens_platform_admin() AND NEW.created_by_user_id=rowlens_user_id();
 ELSE NEW.is_example:=OLD.is_example; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stamp_example BEFORE INSERT OR UPDATE ON rowing_session FOR EACH ROW EXECUTE FUNCTION rowlens_stamp_example();
--> statement-breakpoint
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('rowlens_example_session','rowlens_example_video','rowlens_example_rower','rowlens_examples','rowlens_can_read_training_row') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO rowlens_app',f.sig);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION rowlens_stamp_example() FROM PUBLIC;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_can_see_moment(p_video uuid, p_frame integer) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT rowlens_can_see_video(p_video) AND (rowlens_sees_all()
			OR rowlens_coaches_video(p_video)
			OR EXISTS (SELECT 1 FROM annotation AS a
				WHERE a.video_id = p_video AND a.frame = p_frame
					AND a.author_user_id = rowlens_user_id())
			OR EXISTS (
				SELECT 1 FROM moment AS m
				WHERE m.video_id = p_video AND m.frame = p_frame AND (
					EXISTS (SELECT 1 FROM moment_rower AS mr
						WHERE mr.moment_id = m.id AND mr.rower_id IN (SELECT rowlens_my_rowers()))
					OR EXISTS (SELECT 1 FROM moment_share AS s
						WHERE s.moment_id = m.id AND s.scope = 'rower'
							AND s.rower_id IN (SELECT rowlens_my_rowers()))
					OR EXISTS (SELECT 1 FROM moment_share AS s
						JOIN video AS v ON v.id = m.video_id
						JOIN lineup_seat AS ls ON ls.session_id = v.session_id
						WHERE s.moment_id = m.id AND s.scope = 'crew'
							AND ls.rower_id IN (SELECT rowlens_my_rowers()))
				)
			)
	) $$;

--> statement-breakpoint
CREATE POLICY "angle_measure_example_read" ON "angle_measure" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or rowlens_example_video("angle_measure"."video_id"));--> statement-breakpoint
CREATE POLICY "angle_measure_example_add" ON "angle_measure" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "angle_measure_example_edit" ON "angle_measure" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "angle_measure_example_delete" ON "angle_measure" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "annotation_example_read" ON "annotation" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "annotation_example_add" ON "annotation" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "annotation_example_edit" ON "annotation" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "annotation_example_delete" ON "annotation" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "club_access_example_read" ON "club_access" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "club_access_example_add" ON "club_access" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "club_access_example_edit" ON "club_access" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "club_access_example_delete" ON "club_access" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "club_access_log_example_read" ON "club_access_log" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "club_access_log_example_add" ON "club_access_log" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "club_access_log_example_edit" ON "club_access_log" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "club_access_log_example_delete" ON "club_access_log" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "club_notice_example_read" ON "club_application_notice" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "club_notice_example_add" ON "club_application_notice" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "club_notice_example_edit" ON "club_application_notice" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "club_notice_example_delete" ON "club_application_notice" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "job_example_read" ON "job" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "job_example_add" ON "job" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "job_example_edit" ON "job" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "job_example_delete" ON "job" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "lineup_seat_example_read" ON "lineup_seat" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or rowlens_example_session("lineup_seat"."session_id"));--> statement-breakpoint
CREATE POLICY "lineup_seat_example_add" ON "lineup_seat" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "lineup_seat_example_edit" ON "lineup_seat" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "lineup_seat_example_delete" ON "lineup_seat" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "login_code_example_read" ON "login_code" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "login_code_example_add" ON "login_code" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "login_code_example_edit" ON "login_code" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "login_code_example_delete" ON "login_code" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "membership_example_read" ON "membership" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "membership_example_add" ON "membership" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "membership_example_edit" ON "membership" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "membership_example_delete" ON "membership" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "membership_application_example_read" ON "membership_application" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "membership_application_example_add" ON "membership_application" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "membership_application_example_edit" ON "membership_application" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "membership_application_example_delete" ON "membership_application" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_example_read" ON "moment" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "moment_example_add" ON "moment" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_example_edit" ON "moment" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_example_delete" ON "moment" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_rower_example_read" ON "moment_rower" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "moment_rower_example_add" ON "moment_rower" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_rower_example_edit" ON "moment_rower" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_rower_example_delete" ON "moment_rower" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_rower_log_example_read" ON "moment_rower_log" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "moment_rower_log_example_add" ON "moment_rower_log" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_rower_log_example_edit" ON "moment_rower_log" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_rower_log_example_delete" ON "moment_rower_log" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_share_example_read" ON "moment_share" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "moment_share_example_add" ON "moment_share" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_share_example_edit" ON "moment_share" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "moment_share_example_delete" ON "moment_share" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "rower_example_read" ON "rower" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or rowlens_example_rower("rower"."id"));--> statement-breakpoint
CREATE POLICY "rower_example_add" ON "rower" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "rower_example_edit" ON "rower" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "rower_example_delete" ON "rower" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "rowing_session_example_read" ON "rowing_session" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or rowlens_example_session("rowing_session"."id"));--> statement-breakpoint
CREATE POLICY "rowing_session_example_add" ON "rowing_session" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "rowing_session_example_edit" ON "rowing_session" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "rowing_session_example_delete" ON "rowing_session" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "stroke_mark_example_read" ON "stroke_mark" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or rowlens_example_video("stroke_mark"."video_id"));--> statement-breakpoint
CREATE POLICY "stroke_mark_example_add" ON "stroke_mark" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "stroke_mark_example_edit" ON "stroke_mark" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "stroke_mark_example_delete" ON "stroke_mark" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "user_session_example_read" ON "user_session" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "user_session_example_add" ON "user_session" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "user_session_example_edit" ON "user_session" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "user_session_example_delete" ON "user_session" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "user_settings_audit_example_read" ON "user_settings_audit" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "user_settings_audit_example_add" ON "user_settings_audit" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "user_settings_audit_example_edit" ON "user_settings_audit" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "user_settings_audit_example_delete" ON "user_settings_audit" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_example_read" ON "video" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or rowlens_example_session("video"."session_id"));--> statement-breakpoint
CREATE POLICY "video_example_add" ON "video" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_example_edit" ON "video" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_example_delete" ON "video" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_annotation_reference_example_read" ON "video_annotation_reference" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "video_annotation_reference_example_add" ON "video_annotation_reference" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_annotation_reference_example_edit" ON "video_annotation_reference" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_annotation_reference_example_delete" ON "video_annotation_reference" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_asset_example_read" ON "video_asset" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "video_asset_example_add" ON "video_asset" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_asset_example_edit" ON "video_asset" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_asset_example_delete" ON "video_asset" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_auto_boat_line_example_read" ON "video_auto_boat_line" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or rowlens_example_video("video_auto_boat_line"."video_id"));--> statement-breakpoint
CREATE POLICY "video_auto_boat_line_example_add" ON "video_auto_boat_line" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_auto_boat_line_example_edit" ON "video_auto_boat_line" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_auto_boat_line_example_delete" ON "video_auto_boat_line" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_boat_line_example_read" ON "video_boat_line" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or rowlens_example_video("video_boat_line"."video_id"));--> statement-breakpoint
CREATE POLICY "video_boat_line_example_add" ON "video_boat_line" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_boat_line_example_edit" ON "video_boat_line" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "video_boat_line_example_delete" ON "video_boat_line" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
ALTER POLICY "annotation_role_read" ON "annotation" TO rowlens_app USING (rowlens_can_see_video("annotation"."video_id") and (rowlens_can_see_moment("annotation"."video_id", "annotation"."frame") or "annotation"."author_user_id" = rowlens_user_id()));--> statement-breakpoint
ALTER POLICY "rowing_session_role_read" ON "rowing_session" TO rowlens_app USING (rowlens_can_read_training_row("rowing_session"."id", "rowing_session"."created_by_user_id"));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_user_settings(p_user uuid DEFAULT rowlens_user_id()) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('firstName',u.first_name,'lastName',u.last_name,
 'defaultBoatType',u.default_boat_type,'primaryClubId',u.primary_club_id,'revision',u.settings_revision,
 'preferences',jsonb_build_object('language',u.language,'theme',u.theme,
 'notesVisible',u.notes_visible,'noteHoldSeconds',u.note_hold_seconds,'driveMiddle',u.drive_middle))
 FROM app_user u WHERE u.id=p_user AND rowlens_user_id() IS NOT NULL
 AND (p_user=rowlens_user_id() OR rowlens_platform_admin() OR (rowlens_admin_member() AND EXISTS(
 SELECT 1 FROM membership m WHERE m.user_id=p_user AND m.club_id=nullif(current_setting('app.club_id',true),'')::uuid)))
$$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_set_user_settings(p_user uuid,p_patch jsonb,p_revision integer,p_import boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 u app_user%ROWTYPE;
 old jsonb;
 applied jsonb := '{}'::jsonb;
 k text; v jsonb;
 changed text[] := ARRAY[]::text[];
BEGIN
 -- Share the access lock with role changes/revocation, then lock the central account row.
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:' || current_setting('app.club_id',true),0));
 IF rowlens_user_settings(p_user) IS NULL THEN RETURN NULL; END IF;
 IF p_import AND p_user<>rowlens_user_id() THEN RETURN NULL; END IF;
 SELECT * INTO u FROM app_user WHERE id=p_user FOR UPDATE;
 IF rowlens_user_settings(p_user) IS NULL THEN RETURN NULL; END IF;
 IF NOT p_import AND (p_revision IS NULL AND p_user<>rowlens_user_id()
 OR p_revision IS NOT NULL AND p_revision<>u.settings_revision) THEN
 RETURN jsonb_build_object('conflict',true); END IF;
 old:=rowlens_user_settings(p_user);
 old:=(old->'preferences') || (old-'preferences'-'revision');
 IF jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'invalid_settings'; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_patch) LOOP
   IF NOT k=ANY(ARRAY['primaryClubId','firstName','lastName','defaultBoatType','language','theme','notesVisible','noteHoldSeconds','driveMiddle'])
   THEN RAISE EXCEPTION 'invalid_settings'; END IF;
   IF p_import AND NOT k=ANY(ARRAY['language','theme','notesVisible','noteHoldSeconds','driveMiddle'])
   THEN RAISE EXCEPTION 'invalid_settings'; END IF;
   IF k='primaryClubId' AND (jsonb_typeof(v) NOT IN ('string','null') OR (v<>'null'::jsonb AND NOT EXISTS(SELECT 1 FROM membership m JOIN club c ON c.id=m.club_id WHERE m.user_id=p_user AND m.club_id=(v#>>'{}')::uuid AND c.archived_at IS NULL))) THEN RETURN NULL; END IF;
   IF k=ANY(ARRAY['notesVisible','driveMiddle']) AND jsonb_typeof(v)<>'boolean'
   OR k='noteHoldSeconds' AND jsonb_typeof(v)<>'number'
   OR k=ANY(ARRAY['firstName','lastName','language','theme']) AND jsonb_typeof(v)<>'string'
   OR k='defaultBoatType' AND jsonb_typeof(v) NOT IN ('string','null')
   THEN RAISE EXCEPTION 'invalid_settings'; END IF;
   IF (NOT p_import OR old->k='null'::jsonb) AND (old->k IS DISTINCT FROM v) THEN
     applied:=applied || jsonb_build_object(k,v); changed:=array_append(changed,k);
   END IF;
 END LOOP;
 IF cardinality(changed)=0 THEN RETURN rowlens_user_settings(p_user); END IF;
 UPDATE app_user SET
 primary_club_id=CASE WHEN applied?'primaryClubId' THEN (applied->>'primaryClubId')::uuid ELSE primary_club_id END,
 first_name=CASE WHEN applied?'firstName' THEN btrim(applied->>'firstName') ELSE first_name END,
 last_name=CASE WHEN applied?'lastName' THEN btrim(applied->>'lastName') ELSE last_name END,
 default_boat_type=CASE WHEN applied?'defaultBoatType' THEN applied->>'defaultBoatType' ELSE default_boat_type END,
 language=CASE WHEN applied?'language' THEN applied->>'language' ELSE language END,
 theme=CASE WHEN applied?'theme' THEN applied->>'theme' ELSE theme END,
 notes_visible=CASE WHEN applied?'notesVisible' THEN (applied->>'notesVisible')::boolean ELSE notes_visible END,
 note_hold_seconds=CASE WHEN applied?'noteHoldSeconds' THEN (applied->>'noteHoldSeconds')::double precision ELSE note_hold_seconds END,
 drive_middle=CASE WHEN applied?'driveMiddle' THEN (applied->>'driveMiddle')::boolean ELSE drive_middle END,
 settings_revision=settings_revision+1, settings_updated_at=now()
 WHERE id=p_user;
 UPDATE app_user SET display_name=first_name||' '||last_name WHERE id=p_user
 AND first_name IS NOT NULL AND last_name IS NOT NULL AND (applied?'firstName' OR applied?'lastName');
 IF rowlens_admin_member() AND EXISTS(SELECT 1 FROM club WHERE id=nullif(current_setting('app.club_id',true),'')::uuid) THEN
   INSERT INTO user_settings_audit(club_id,subject_user_id,actor_user_id,changed_keys)
   VALUES(nullif(current_setting('app.club_id',true),'')::uuid,p_user,rowlens_user_id(),changed);
 END IF;
 RETURN rowlens_user_settings(p_user);
END $$;


--> statement-breakpoint
ALTER POLICY annotation_role_read ON annotation USING (rowlens_can_see_video(video_id) AND (rowlens_can_see_moment(video_id,frame) OR author_user_id=rowlens_user_id()));
