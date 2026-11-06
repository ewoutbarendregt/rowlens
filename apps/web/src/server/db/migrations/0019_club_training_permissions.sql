-- #154: every club member can read trainings; only owners and coach/admin roles may write.
-- Keep rowlens_sees_all admin/service-only: reading must not unlock privileged write policies.
CREATE FUNCTION rowlens_can_read_trainings() RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 -- The new web image opts in per transaction. Missing context retains pre-#155 semantics
 -- while the old image is still serving during migration, or after an authorized rollback.
 SELECT coalesce(current_setting('app.training_permissions',true),'') IN ('','owner-or-staff')
 AND (rowlens_has_role('rower') OR rowlens_roster_manager())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_can_see_session(p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_can_read_trainings() AND EXISTS(SELECT 1 FROM rowing_session s
 WHERE s.id=p_session AND s.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND (current_setting('app.training_permissions',true)='owner-or-staff' OR rowlens_sees_all()
 OR s.created_by_user_id=rowlens_user_id() OR rowlens_session_reachable(s.id)))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_can_edit_session(p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_can_read_trainings() AND EXISTS(SELECT 1 FROM rowing_session s
 WHERE s.id=p_session AND s.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND CASE WHEN current_setting('app.training_permissions',true)='owner-or-staff'
 THEN rowlens_roster_manager() OR (rowlens_has_role('rower') AND s.created_by_user_id=rowlens_user_id())
 ELSE rowlens_sees_all() OR s.created_by_user_id=rowlens_user_id() OR rowlens_session_reachable(s.id) END)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_can_edit_video(p_video uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM video v WHERE v.id=p_video
 AND v.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_can_edit_session(v.session_id))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_can_edit_moment(p_moment uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM moment m WHERE m.id=p_moment
 AND m.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_can_edit_video(m.video_id))
$$;
--> statement-breakpoint
-- Creator reassignment remains admin-only, even when a coach may edit the whole training.
CREATE FUNCTION rowlens_may_set_session_creator(p_session uuid,p_creator uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_sees_all() OR EXISTS(SELECT 1 FROM rowing_session s WHERE s.id=p_session
 AND s.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND s.created_by_user_id IS NOT DISTINCT FROM p_creator)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_can_read_trainings() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_can_read_trainings() TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_can_edit_session(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_can_edit_session(uuid) TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_can_edit_video(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_can_edit_video(uuid) TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_can_edit_moment(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_can_edit_moment(uuid) TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_may_set_session_creator(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_may_set_session_creator(uuid,uuid) TO rowlens_app;
--> statement-breakpoint
DROP POLICY "lineup_seat_role" ON "lineup_seat" CASCADE;--> statement-breakpoint
DROP POLICY "moment_role" ON "moment" CASCADE;--> statement-breakpoint
DROP POLICY "moment_rower_role" ON "moment_rower" CASCADE;--> statement-breakpoint
DROP POLICY "moment_rower_log_role" ON "moment_rower_log" CASCADE;--> statement-breakpoint
DROP POLICY "moment_share_role" ON "moment_share" CASCADE;--> statement-breakpoint
DROP POLICY "rowing_session_role" ON "rowing_session" CASCADE;--> statement-breakpoint
DROP POLICY "video_role" ON "video" CASCADE;--> statement-breakpoint
CREATE POLICY "lineup_seat_role_read" ON "lineup_seat" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_session("lineup_seat"."session_id"));--> statement-breakpoint
CREATE POLICY "lineup_seat_role_add" ON "lineup_seat" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_can_edit_session("lineup_seat"."session_id"));--> statement-breakpoint
CREATE POLICY "lineup_seat_role_edit" ON "lineup_seat" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_can_edit_session("lineup_seat"."session_id")) WITH CHECK (rowlens_can_edit_session("lineup_seat"."session_id"));--> statement-breakpoint
CREATE POLICY "lineup_seat_role_delete" ON "lineup_seat" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_can_edit_session("lineup_seat"."session_id"));--> statement-breakpoint
CREATE POLICY "moment_role_read" ON "moment" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_moment("moment"."video_id", "moment"."frame"));--> statement-breakpoint
CREATE POLICY "moment_role_add" ON "moment" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_can_edit_video("moment"."video_id") and rowlens_can_see_moment("moment"."video_id", "moment"."frame"));--> statement-breakpoint
CREATE POLICY "moment_role_edit" ON "moment" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_can_edit_video("moment"."video_id") and rowlens_can_see_moment("moment"."video_id", "moment"."frame")) WITH CHECK (rowlens_can_edit_video("moment"."video_id") and rowlens_can_see_moment("moment"."video_id", "moment"."frame"));--> statement-breakpoint
CREATE POLICY "moment_role_delete" ON "moment" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_can_edit_video("moment"."video_id") and rowlens_can_see_moment("moment"."video_id", "moment"."frame"));--> statement-breakpoint
CREATE POLICY "moment_rower_role_read" ON "moment_rower" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_moment_id("moment_rower"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_rower_role_add" ON "moment_rower" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_can_edit_moment("moment_rower"."moment_id") and rowlens_can_see_moment_id("moment_rower"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_rower_role_edit" ON "moment_rower" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_can_edit_moment("moment_rower"."moment_id") and rowlens_can_see_moment_id("moment_rower"."moment_id")) WITH CHECK (rowlens_can_edit_moment("moment_rower"."moment_id") and rowlens_can_see_moment_id("moment_rower"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_rower_role_delete" ON "moment_rower" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_can_edit_moment("moment_rower"."moment_id") and rowlens_can_see_moment_id("moment_rower"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_rower_log_role_read" ON "moment_rower_log" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_moment_id("moment_rower_log"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_rower_log_role_add" ON "moment_rower_log" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_can_edit_moment("moment_rower_log"."moment_id") and rowlens_can_see_moment_id("moment_rower_log"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_rower_log_role_edit" ON "moment_rower_log" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_can_edit_moment("moment_rower_log"."moment_id") and rowlens_can_see_moment_id("moment_rower_log"."moment_id")) WITH CHECK (rowlens_can_edit_moment("moment_rower_log"."moment_id") and rowlens_can_see_moment_id("moment_rower_log"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_rower_log_role_delete" ON "moment_rower_log" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_can_edit_moment("moment_rower_log"."moment_id") and rowlens_can_see_moment_id("moment_rower_log"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_share_role_read" ON "moment_share" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_moment_id("moment_share"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_share_role_add" ON "moment_share" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_can_edit_moment("moment_share"."moment_id") and rowlens_can_see_moment_id("moment_share"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_share_role_edit" ON "moment_share" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_can_edit_moment("moment_share"."moment_id") and rowlens_can_see_moment_id("moment_share"."moment_id")) WITH CHECK (rowlens_can_edit_moment("moment_share"."moment_id") and rowlens_can_see_moment_id("moment_share"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_share_role_delete" ON "moment_share" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_can_edit_moment("moment_share"."moment_id") and rowlens_can_see_moment_id("moment_share"."moment_id"));--> statement-breakpoint
CREATE POLICY "rowing_session_role_read" ON "rowing_session" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_read_trainings() and (current_setting('app.training_permissions', true) = 'owner-or-staff' or rowlens_sees_all() or "rowing_session"."created_by_user_id" = rowlens_user_id() or rowlens_session_reachable("rowing_session"."id")));--> statement-breakpoint
CREATE POLICY "rowing_session_role_add" ON "rowing_session" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_roster_manager() or (rowlens_has_role('rower') and "rowing_session"."created_by_user_id" = rowlens_user_id()));--> statement-breakpoint
CREATE POLICY "rowing_session_role_edit" ON "rowing_session" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_can_edit_session("rowing_session"."id")) WITH CHECK (rowlens_can_edit_session("rowing_session"."id") and rowlens_may_set_session_creator("rowing_session"."id","rowing_session"."created_by_user_id"));--> statement-breakpoint
CREATE POLICY "rowing_session_role_delete" ON "rowing_session" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_can_edit_session("rowing_session"."id"));--> statement-breakpoint
CREATE POLICY "video_role_read" ON "video" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_session("video"."session_id"));--> statement-breakpoint
CREATE POLICY "video_role_add" ON "video" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_can_edit_session("video"."session_id"));--> statement-breakpoint
CREATE POLICY "video_role_edit" ON "video" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_can_edit_session("video"."session_id")) WITH CHECK (rowlens_can_edit_session("video"."session_id"));--> statement-breakpoint
CREATE POLICY "video_role_delete" ON "video" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_can_edit_session("video"."session_id"));--> statement-breakpoint
ALTER POLICY "annotation_role_add" ON "annotation" TO rowlens_app WITH CHECK (rowlens_can_edit_video("annotation"."video_id") and (rowlens_sees_all() or ("annotation"."author_user_id" = rowlens_user_id() and rowlens_can_see_video("annotation"."video_id"))));--> statement-breakpoint
ALTER POLICY "annotation_role_edit" ON "annotation" TO rowlens_app USING (rowlens_can_edit_video("annotation"."video_id") and (rowlens_sees_all() or "annotation"."author_user_id" = rowlens_user_id() or rowlens_coaches_video("annotation"."video_id"))) WITH CHECK (rowlens_can_edit_video("annotation"."video_id") and (rowlens_sees_all() or "annotation"."author_user_id" = rowlens_user_id() or rowlens_coaches_video("annotation"."video_id")));--> statement-breakpoint
ALTER POLICY "annotation_role_delete" ON "annotation" TO rowlens_app USING (rowlens_can_edit_video("annotation"."video_id") and (rowlens_sees_all() or "annotation"."author_user_id" = rowlens_user_id() or rowlens_coaches_video("annotation"."video_id")));