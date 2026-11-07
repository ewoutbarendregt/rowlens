ALTER TABLE "club" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE FUNCTION rowlens_club_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM club WHERE id=nullif(current_setting('app.club_id',true),'')::uuid AND archived_at IS NULL)
$$;
REVOKE ALL ON FUNCTION rowlens_club_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rowlens_club_active() TO rowlens_app;
--> statement-breakpoint
ALTER POLICY "angle_measure_tenant" ON "angle_measure" TO rowlens_app USING ("angle_measure"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("angle_measure"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "annotation_tenant" ON "annotation" TO rowlens_app USING ("annotation"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("annotation"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "club_read_own" ON "club" TO rowlens_app USING ("club"."id" = nullif(current_setting('app.club_id', true), '')::uuid and "club"."archived_at" is null);--> statement-breakpoint
ALTER POLICY "club_access_tenant" ON "club_access" TO rowlens_app USING ("club_access"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("club_access"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "club_access_log_tenant" ON "club_access_log" TO rowlens_app USING ("club_access_log"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("club_access_log"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "job_tenant" ON "job" TO rowlens_app USING ("job"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("job"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "lineup_seat_tenant" ON "lineup_seat" TO rowlens_app USING ("lineup_seat"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("lineup_seat"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "login_code_tenant" ON "login_code" TO rowlens_app USING ("login_code"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("login_code"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "membership_tenant" ON "membership" TO rowlens_app USING ("membership"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("membership"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "membership_application_tenant" ON "membership_application" TO rowlens_app USING ("membership_application"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("membership_application"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "moment_tenant" ON "moment" TO rowlens_app USING ("moment"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("moment"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "moment_rower_tenant" ON "moment_rower" TO rowlens_app USING ("moment_rower"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("moment_rower"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "moment_rower_log_tenant" ON "moment_rower_log" TO rowlens_app USING ("moment_rower_log"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("moment_rower_log"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "moment_share_tenant" ON "moment_share" TO rowlens_app USING ("moment_share"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("moment_share"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "rower_tenant" ON "rower" TO rowlens_app USING ("rower"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("rower"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "rowing_session_tenant" ON "rowing_session" TO rowlens_app USING ("rowing_session"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("rowing_session"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "stroke_mark_tenant" ON "stroke_mark" TO rowlens_app USING ("stroke_mark"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("stroke_mark"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "user_session_tenant" ON "user_session" TO rowlens_app USING ("user_session"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("user_session"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "user_settings_audit_tenant" ON "user_settings_audit" TO rowlens_app USING ("user_settings_audit"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("user_settings_audit"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "video_tenant" ON "video" TO rowlens_app USING ("video"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("video"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "video_auto_boat_line_tenant" ON "video_auto_boat_line" TO rowlens_app USING ("video_auto_boat_line"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("video_auto_boat_line"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
ALTER POLICY "video_boat_line_tenant" ON "video_boat_line" TO rowlens_app USING ("video_boat_line"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("video_boat_line"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_account_clubs() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name,
 'roles',coalesce(m.roles,ARRAY['admin']::text[]),'member',m.user_id IS NOT NULL) ORDER BY (m.user_id IS NOT NULL) DESC,c.name),'[]'::jsonb)
 FROM club c LEFT JOIN membership m ON m.club_id=c.id AND m.user_id=rowlens_user_id()
 WHERE c.archived_at IS NULL AND (m.user_id IS NOT NULL OR rowlens_platform_admin())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_club_directory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug) ORDER BY name),'[]'::jsonb)
 FROM club WHERE rowlens_user_id() IS NOT NULL AND archived_at IS NULL
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_apply_to_club(p_club uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=rowlens_user_id() AND verified_at IS NOT NULL
 AND first_name IS NOT NULL AND last_name IS NOT NULL) THEN RETURN false; END IF;
 PERFORM 1 FROM club WHERE id=p_club AND archived_at IS NULL FOR SHARE; IF NOT FOUND THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM membership WHERE club_id=p_club AND user_id=rowlens_user_id()) THEN RETURN false; END IF;
 INSERT INTO membership_application(club_id,user_id) VALUES(p_club,rowlens_user_id())
 ON CONFLICT(club_id,user_id) DO UPDATE SET status='pending',decided_by=NULL,updated_at=now()
 WHERE membership_application.status='cancelled'
 OR (membership_application.status='rejected' AND membership_application.updated_at<now()-interval '7 days');
 RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_admin_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_club_active() AND (rowlens_platform_admin() OR (rowlens_has_role('admin') AND EXISTS(SELECT 1 FROM membership m
 WHERE m.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND m.user_id=rowlens_user_id() AND 'admin'=ANY(m.roles))))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_platform_clubs() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,'name',name,'archivedAt',archived_at)
 ORDER BY archived_at IS NOT NULL,name),'[]'::jsonb) FROM club WHERE rowlens_platform_admin()
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_archive_club(p_id uuid,p_archive boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT rowlens_platform_admin() THEN RETURN false; END IF;
 UPDATE club SET archived_at=CASE WHEN p_archive THEN now() ELSE NULL END
 WHERE id=p_id AND (archived_at IS NOT NULL)<>p_archive;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO platform_audit(actor_user_id,action,target) VALUES(rowlens_user_id(),
 CASE WHEN p_archive THEN 'club.archived' ELSE 'club.restored' END,p_id::text);
 RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_platform_clubs(),rowlens_archive_club(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rowlens_platform_clubs(),rowlens_archive_club(uuid,boolean) TO rowlens_app;
