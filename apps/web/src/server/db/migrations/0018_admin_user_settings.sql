-- #151: one global account, additive role sets, guarded account settings and an audit trail.
CREATE FUNCTION rowlens_valid_roles(p_roles text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
 SELECT coalesce(array_ndims(p_roles) = 1 AND cardinality(p_roles) BETWEEN 1 AND 3
 AND p_roles <@ ARRAY['rower','coach','admin']::text[] AND array_position(p_roles,NULL) IS NULL
 AND cardinality(p_roles) = (SELECT count(DISTINCT r) FROM unnest(p_roles) r),false)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_has_role(p_role text) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT coalesce(nullif(current_setting('app.roles',true),'')::jsonb ? p_role,false)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_service() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT coalesce(current_setting('app.service',true) = 'true',false)
 AND nullif(current_setting('app.user_id',true),'') IS NULL
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_sees_all() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT rowlens_has_role('admin') OR rowlens_service()
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_roster_manager() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
 SELECT rowlens_sees_all() OR rowlens_has_role('coach')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_coaches_video(p_video uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
 SELECT rowlens_has_role('coach') AND EXISTS (
 SELECT 1 FROM video v WHERE v.id=p_video AND rowlens_can_see_session(v.session_id))
$$;
--> statement-breakpoint
-- Names needed within visible trainings, never a whole-club roster for a rower.
CREATE FUNCTION rowlens_training_rower_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT ls.rower_id FROM lineup_seat ls
 WHERE ls.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_can_see_session(ls.session_id)
 UNION SELECT mr.rower_id FROM moment_rower mr JOIN moment m ON m.id=mr.moment_id
 WHERE mr.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_can_see_moment_id(m.id)
 UNION SELECT ms.rower_id FROM moment_share ms JOIN moment m ON m.id=ms.moment_id
 WHERE ms.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND ms.rower_id IS NOT NULL AND rowlens_can_see_moment_id(m.id)
$$;
--> statement-breakpoint
CREATE TABLE "user_settings_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"subject_user_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"changed_keys" text[] NOT NULL,
	"roles" text[],
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_settings_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "club_access" DROP CONSTRAINT "club_access_role_check";--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT "membership_role_check";--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "notes_visible" boolean;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "note_hold_seconds" double precision;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "drive_middle" boolean;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "settings_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "settings_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "club_access" ADD COLUMN "roles" text[];--> statement-breakpoint
UPDATE club_access SET roles = ARRAY[role];--> statement-breakpoint
ALTER TABLE club_access ALTER COLUMN roles SET NOT NULL;--> statement-breakpoint
ALTER TABLE "club_access_log" ADD COLUMN "roles" text[];--> statement-breakpoint
ALTER TABLE "membership" ADD COLUMN "roles" text[] DEFAULT ARRAY['coach']::text[] NOT NULL;--> statement-breakpoint
UPDATE membership SET roles = ARRAY[role];--> statement-breakpoint
ALTER TABLE "user_settings_audit" ADD CONSTRAINT "user_settings_audit_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_settings_audit_club_at_idx" ON "user_settings_audit" USING btree ("club_id","at");--> statement-breakpoint
ALTER TABLE "club_access" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "membership" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_language_check" CHECK ("app_user"."language" is null or "app_user"."language" in ('nl','en'));--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_theme_check" CHECK ("app_user"."theme" is null or "app_user"."theme" in ('light','dark','hc'));--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_hold_check" CHECK ("app_user"."note_hold_seconds" is null or "app_user"."note_hold_seconds" in (0.5,1,2));--> statement-breakpoint
ALTER TABLE "club_access" ADD CONSTRAINT "club_access_roles_check" CHECK (rowlens_valid_roles("club_access"."roles"));--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_roles_check" CHECK (rowlens_valid_roles("membership"."roles"));--> statement-breakpoint
CREATE POLICY "rower_read" ON "rower" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_roster_manager() or "rower"."user_id" = rowlens_user_id() or "rower"."id" in (select rowlens_training_rower_ids()));--> statement-breakpoint
CREATE POLICY "rower_add" ON "rower" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_roster_manager());--> statement-breakpoint
CREATE POLICY "rower_edit" ON "rower" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_roster_manager()) WITH CHECK (rowlens_roster_manager());--> statement-breakpoint
CREATE POLICY "rower_delete" ON "rower" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_roster_manager());--> statement-breakpoint
CREATE POLICY "user_settings_audit_tenant" ON "user_settings_audit" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("user_settings_audit"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("user_settings_audit"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "user_settings_audit_read" ON "user_settings_audit" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_has_role('admin'));--> statement-breakpoint
CREATE POLICY "user_settings_audit_add" ON "user_settings_audit" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_has_role('admin') and "user_settings_audit"."actor_user_id" = rowlens_user_id() and exists (select 1 from membership m where m.club_id = "user_settings_audit"."club_id" and m.user_id = "user_settings_audit"."subject_user_id"));--> statement-breakpoint
CREATE POLICY "user_settings_audit_edit" ON "user_settings_audit" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "user_settings_audit_delete" ON "user_settings_audit" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (false);
--> statement-breakpoint
DROP FUNCTION rowlens_auth_access(text,text);
--> statement-breakpoint
CREATE FUNCTION rowlens_auth_access(p_email text,p_club_slug text) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT a.roles FROM club_access a JOIN club c ON c.id=a.club_id
 WHERE c.slug=p_club_slug AND a.email=p_email
$$;
--> statement-breakpoint
DROP FUNCTION rowlens_auth_ensure_user(text,text,text,text,text);
--> statement-breakpoint
CREATE FUNCTION rowlens_auth_ensure_user(
	p_email text,
	p_display_name text,
	p_locale text,
	p_club_slug text,
	p_server_roles text[]
) RETURNS TABLE(user_id uuid, club_id uuid, email text, display_name text, locale text)
	LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
#variable_conflict use_column
DECLARE
	v_user_id uuid;
	v_club_id uuid;
	v_roles text[];
BEGIN
	SELECT c.id INTO v_club_id FROM club AS c WHERE c.slug = p_club_slug;
	IF v_club_id IS NULL THEN
		RETURN;
	END IF;

	PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:' || v_club_id::text,0));
 SELECT a.roles INTO v_roles FROM club_access a WHERE a.club_id=v_club_id AND a.email=p_email;
 IF v_roles IS NULL THEN v_roles:=p_server_roles;
 ELSIF 'admin'=ANY(p_server_roles) THEN
 SELECT array_agg(r ORDER BY ord) INTO v_roles FROM unnest(ARRAY['rower','coach','admin']) WITH ORDINALITY t(r,ord)
 WHERE r=ANY(v_roles) OR r='admin';
 END IF;
 IF NOT rowlens_valid_roles(v_roles) THEN RETURN; END IF;

	INSERT INTO app_user AS u (email, display_name, locale)
	VALUES (p_email, p_display_name, CASE WHEN p_locale = 'en' THEN 'en' ELSE 'nl' END)
	ON CONFLICT ON CONSTRAINT app_user_email_unique DO UPDATE SET email = excluded.email
	RETURNING u.id INTO v_user_id;

	INSERT INTO membership AS m (club_id, user_id, roles)
	VALUES (v_club_id, v_user_id, v_roles)
	ON CONFLICT (club_id, user_id) DO UPDATE SET roles = excluded.roles;

	UPDATE rower AS r SET user_id = v_user_id, updated_at = now()
	WHERE r.club_id = v_club_id AND r.email = p_email AND r.user_id IS NULL
		AND NOT EXISTS (SELECT 1 FROM rower AS o WHERE o.club_id = v_club_id AND o.user_id = v_user_id);

	RETURN QUERY
	SELECT u.id, m.club_id, u.email, u.display_name, u.locale
	FROM app_user AS u
	JOIN membership AS m ON m.user_id = u.id
	WHERE u.id = v_user_id AND m.club_id = v_club_id;
END;
$$;

--> statement-breakpoint
DROP FUNCTION rowlens_auth_session(text);
--> statement-breakpoint
CREATE FUNCTION rowlens_auth_session(p_token_hash text)
RETURNS TABLE(
	session_id uuid,
	user_id uuid,
	club_id uuid,
	csrf_hash text,
	email text,
	display_name text,
	locale text,
	roles text[]
)
	LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		WITH refreshed AS (
			UPDATE user_session AS s
			SET last_seen_at = now(), expires_at = now() + interval '30 days'
			WHERE s.token_hash = p_token_hash
				AND s.revoked_at IS NULL
				AND s.expires_at > now()
			RETURNING s.id, s.user_id, s.club_id, s.csrf_hash
		)
		SELECT s.id, s.user_id, s.club_id, s.csrf_hash, u.email, u.display_name, u.locale, m.roles
		FROM refreshed AS s
		JOIN app_user AS u ON u.id = s.user_id
		JOIN membership AS m ON m.user_id = s.user_id AND m.club_id = s.club_id
	$$;

--> statement-breakpoint
DROP FUNCTION rowlens_club_members();
--> statement-breakpoint
CREATE FUNCTION rowlens_club_members()
RETURNS TABLE(user_id uuid, email text, roles text[], joined_at timestamptz, last_seen_at timestamptz,
	first_name text, last_name text)
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT u.id, u.email, m.roles, m.created_at,
			(SELECT max(s.last_seen_at) FROM user_session AS s
			 WHERE s.user_id = m.user_id AND s.club_id = m.club_id),
			u.first_name, u.last_name
		FROM membership AS m
		JOIN app_user AS u ON u.id = m.user_id
		WHERE m.club_id = nullif(current_setting('app.club_id', true), '')::uuid
	$$;

--> statement-breakpoint
CREATE FUNCTION rowlens_admin_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_has_role('admin') AND EXISTS(SELECT 1 FROM membership m
 WHERE m.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND m.user_id=rowlens_user_id() AND 'admin'=ANY(m.roles))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_user_settings(p_user uuid DEFAULT rowlens_user_id()) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('firstName',u.first_name,'lastName',u.last_name,
 'defaultBoatType',u.default_boat_type,'revision',u.settings_revision,
 'preferences',jsonb_build_object('language',u.language,'theme',u.theme,
 'notesVisible',u.notes_visible,'noteHoldSeconds',u.note_hold_seconds,'driveMiddle',u.drive_middle))
 FROM app_user u WHERE u.id=p_user AND rowlens_user_id() IS NOT NULL
 AND (p_user=rowlens_user_id() OR rowlens_admin_member())
 AND EXISTS(SELECT 1 FROM membership m WHERE m.user_id=p_user
 AND m.club_id=nullif(current_setting('app.club_id',true),'')::uuid)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_set_user_settings(p_user uuid,p_patch jsonb,p_revision integer,p_import boolean DEFAULT false)
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
   IF NOT k=ANY(ARRAY['firstName','lastName','defaultBoatType','language','theme','notesVisible','noteHoldSeconds','driveMiddle'])
   THEN RAISE EXCEPTION 'invalid_settings'; END IF;
   IF p_import AND NOT k=ANY(ARRAY['language','theme','notesVisible','noteHoldSeconds','driveMiddle'])
   THEN RAISE EXCEPTION 'invalid_settings'; END IF;
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
 IF rowlens_admin_member() THEN
   INSERT INTO user_settings_audit(club_id,subject_user_id,actor_user_id,changed_keys)
   VALUES(nullif(current_setting('app.club_id',true),'')::uuid,p_user,rowlens_user_id(),changed);
 END IF;
 RETURN rowlens_user_settings(p_user);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_set_my_profile(p_first text,p_last text,p_boat text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF rowlens_user_id() IS NULL THEN RAISE EXCEPTION 'no_account'; END IF;
 PERFORM rowlens_set_user_settings(rowlens_user_id(),jsonb_build_object('firstName',p_first,'lastName',p_last,'defaultBoatType',p_boat),NULL,false);
END $$;
--> statement-breakpoint
REVOKE UPDATE,DELETE ON user_settings_audit FROM rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_valid_roles(text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_valid_roles(text[]) TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_has_role(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_has_role(text) TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_service() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_service() TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_roster_manager() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_roster_manager() TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_training_rower_ids() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_training_rower_ids() TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_auth_access(text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_access(text,text) TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_auth_ensure_user(text,text,text,text,text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_ensure_user(text,text,text,text,text[]) TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_auth_session(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_session(text) TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_club_members() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_club_members() TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_admin_member() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_admin_member() TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_user_settings(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_user_settings(uuid) TO rowlens_app;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_set_user_settings(uuid,jsonb,integer,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_set_user_settings(uuid,jsonb,integer,boolean) TO rowlens_app;
--> statement-breakpoint

--> statement-breakpoint
CREATE FUNCTION rowlens_auth_identity_for_club(p_email text,p_club text)
RETURNS TABLE(user_id uuid,club_id uuid,email text,display_name text,locale text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT u.id,m.club_id,u.email,u.display_name,u.locale FROM app_user u
 JOIN membership m ON m.user_id=u.id JOIN club c ON c.id=m.club_id
 WHERE u.email=p_email AND c.slug=p_club
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_auth_identity_for_club(text,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_identity_for_club(text,text) TO rowlens_app;

--> statement-breakpoint
CREATE FUNCTION rowlens_rower_targets(p_ids uuid[]) RETURNS TABLE(id uuid,archived_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,r.archived_at FROM rower r WHERE r.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND r.id=ANY(p_ids)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_rower_targets(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_rower_targets(uuid[]) TO rowlens_app;
