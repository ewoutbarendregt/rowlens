CREATE POLICY "club_access_admin" ON "club_access" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_admin_member() or rowlens_service()) WITH CHECK (rowlens_admin_member() or rowlens_service());--> statement-breakpoint
CREATE POLICY "club_access_log_admin" ON "club_access_log" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_admin_member() or rowlens_service()) WITH CHECK (rowlens_admin_member() or rowlens_service());--> statement-breakpoint
CREATE POLICY "membership_role_read" ON "membership" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING ("membership"."user_id"=rowlens_user_id() or rowlens_admin_member() or rowlens_service());--> statement-breakpoint
CREATE POLICY "membership_role_add" ON "membership" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_admin_member() or rowlens_service());--> statement-breakpoint
CREATE POLICY "membership_role_edit" ON "membership" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_admin_member() or rowlens_service()) WITH CHECK (rowlens_admin_member() or rowlens_service());--> statement-breakpoint
CREATE POLICY "membership_role_delete" ON "membership" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_admin_member() or rowlens_service());--> statement-breakpoint
-- Account names are authoritative across clubs, without changing pre-upgrade roster aliases.
CREATE FUNCTION rowlens_account_projection_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF current_setting('app.unified_users',true)='true' AND NEW.verified_at IS NOT NULL AND NEW.display_name<>'' THEN
 UPDATE rower SET display_name=left(NEW.display_name,60),user_id=NEW.id,updated_at=now() WHERE user_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER account_projection_changed AFTER UPDATE OF display_name,verified_at ON app_user
FOR EACH ROW EXECUTE FUNCTION rowlens_account_projection_changed();
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_account_projection_changed() FROM PUBLIC;
--> statement-breakpoint
-- Retain old bearer/CSRF proofs while making new sessions independent of club membership.
INSERT INTO account_session(user_id,token_hash,csrf_hash,expires_at)
SELECT user_id,token_hash,csrf_hash,expires_at FROM user_session
WHERE revoked_at IS NULL AND expires_at>now() ON CONFLICT(token_hash) DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION rowlens_adopt_legacy_session(p_token text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s user_session%ROWTYPE;
BEGIN
 SELECT * INTO s FROM user_session WHERE token_hash=p_token AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO account_session(user_id,token_hash,csrf_hash,expires_at)
 VALUES(s.user_id,s.token_hash,s.csrf_hash,s.expires_at) ON CONFLICT(token_hash) DO NOTHING;
 UPDATE app_user SET verified_at=coalesce(verified_at,now()) WHERE id=s.user_id;
 RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_adopt_legacy_session(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_adopt_legacy_session(text) TO rowlens_app;

--> statement-breakpoint
CREATE FUNCTION rowlens_revoke_adopted_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.revoked_at IS NOT NULL THEN UPDATE account_session SET revoked_at=NEW.revoked_at WHERE token_hash=NEW.token_hash; END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER revoke_adopted_session AFTER UPDATE OF revoked_at ON user_session
FOR EACH ROW EXECUTE FUNCTION rowlens_revoke_adopted_session();
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_revoke_adopted_session() FROM PUBLIC;

--> statement-breakpoint
-- Effective platform roles are rechecked at statement time, not copied into app.roles.
CREATE OR REPLACE FUNCTION rowlens_has_role(p_role text) RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT (p_role='admin' AND rowlens_platform_admin()) OR coalesce(nullif(current_setting('app.roles',true),'')::jsonb ? p_role,false)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_admitted_accounts() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name) ORDER BY u.display_name),'[]'::jsonb)
 FROM membership m JOIN app_user u ON u.id=m.user_id
 WHERE m.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_admin_member()
 AND u.verified_at IS NOT NULL AND u.first_name IS NOT NULL AND u.last_name IS NOT NULL
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_admitted_accounts() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_admitted_accounts() TO rowlens_app;

--> statement-breakpoint
CREATE FUNCTION rowlens_membership_removed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF current_setting('app.unified_users',true)='true' THEN
 UPDATE membership_application SET status='rejected',decided_by=rowlens_user_id(),updated_at=now()
 WHERE club_id=OLD.club_id AND user_id=OLD.user_id AND status IN ('pending','approved');
 END IF;
 RETURN OLD;
END $$;
--> statement-breakpoint
CREATE TRIGGER membership_removed AFTER DELETE ON membership FOR EACH ROW EXECUTE FUNCTION rowlens_membership_removed();
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_membership_removed() FROM PUBLIC;
