CREATE TABLE "account_login_code" (
	"email" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"locale" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "account_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "account_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "membership_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_application_club_user_unique" UNIQUE("club_id","user_id"),
	CONSTRAINT "membership_application_status_check" CHECK ("membership_application"."status" in ('pending','approved','rejected','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "membership_application" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "platform_admin" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "account_session" ADD CONSTRAINT "account_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_application" ADD CONSTRAINT "membership_application_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_admin" ADD CONSTRAINT "platform_admin_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "membership_application_tenant" ON "membership_application" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("membership_application"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("membership_application"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "membership_application_read" ON "membership_application" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING ("membership_application"."user_id"=rowlens_user_id() or rowlens_admin_member());--> statement-breakpoint
CREATE POLICY "membership_application_write" ON "membership_application" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_admin_member()) WITH CHECK (rowlens_admin_member());--> statement-breakpoint
-- Global identities/tokens/authority are never directly available to the application role.
REVOKE ALL ON account_session,account_login_code,platform_admin,platform_audit FROM rowlens_app;
--> statement-breakpoint
UPDATE app_user u SET verified_at=(SELECT min(s.created_at) FROM user_session s WHERE s.user_id=u.id)
WHERE EXISTS(SELECT 1 FROM user_session s WHERE s.user_id=u.id);
--> statement-breakpoint
CREATE FUNCTION rowlens_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM platform_admin WHERE user_id=rowlens_user_id())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_admin_member() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_platform_admin() OR (rowlens_has_role('admin') AND EXISTS(SELECT 1 FROM membership m
 WHERE m.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND m.user_id=rowlens_user_id() AND 'admin'=ANY(m.roles)))
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_sees_all() RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT rowlens_has_role('admin') OR rowlens_service() OR rowlens_platform_admin()
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_account_issue(p_email text,p_hash text,p_locale text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO account_login_code(email,code_hash,locale,expires_at) VALUES(p_email,p_hash,p_locale,now()+interval '10 minutes')
 ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,locale=excluded.locale,
 expires_at=excluded.expires_at,attempts=0,used_at=NULL
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_account_verify(p_email text,p_hash text,p_token text,p_csrf text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c account_login_code%ROWTYPE; uid uuid;
BEGIN
 SELECT * INTO c FROM account_login_code WHERE email=p_email FOR UPDATE;
 IF NOT FOUND OR c.used_at IS NOT NULL OR c.expires_at<=now() OR c.attempts>=5 THEN RETURN false; END IF;
 IF c.code_hash<>p_hash THEN UPDATE account_login_code SET attempts=attempts+1 WHERE email=p_email; RETURN false; END IF;
 UPDATE account_login_code SET used_at=now() WHERE email=p_email;
 INSERT INTO app_user(email,display_name,locale,verified_at) VALUES(p_email,'',c.locale,now())
 ON CONFLICT(email) DO UPDATE SET verified_at=coalesce(app_user.verified_at,now()) RETURNING id INTO uid;
 INSERT INTO account_session(user_id,token_hash,csrf_hash,expires_at) VALUES(uid,p_token,p_csrf,now()+interval '30 days');
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_account_session(p_token text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid; csrf text;
BEGIN
 UPDATE account_session SET expires_at=now()+interval '30 days'
 WHERE token_hash=p_token AND revoked_at IS NULL AND expires_at>now() RETURNING user_id,csrf_hash INTO uid,csrf;
 IF uid IS NULL THEN RETURN NULL; END IF;
 RETURN (SELECT jsonb_build_object('id',u.id,'email',u.email,'displayName',u.display_name,
 'locale',u.locale,'firstName',u.first_name,'lastName',u.last_name,'defaultBoatType',u.default_boat_type,
 'csrfHash',csrf,'platformAdmin',EXISTS(SELECT 1 FROM platform_admin p WHERE p.user_id=uid)) FROM app_user u WHERE u.id=uid);
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_account_logout(p_token text,p_others boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid;
BEGIN
 SELECT user_id INTO uid FROM account_session WHERE token_hash=p_token AND revoked_at IS NULL AND expires_at>now();
 IF uid IS NULL THEN RETURN; END IF;
 UPDATE account_session SET revoked_at=now() WHERE user_id=uid AND
 CASE WHEN p_others THEN token_hash<>p_token ELSE token_hash=p_token END;
 IF p_others THEN UPDATE user_session SET revoked_at=now() WHERE user_id=uid AND token_hash<>p_token; END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_account_clubs() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name,
 'roles',coalesce(m.roles,ARRAY['admin']::text[]),'member',m.user_id IS NOT NULL) ORDER BY (m.user_id IS NOT NULL) DESC,c.name),'[]'::jsonb)
 FROM club c LEFT JOIN membership m ON m.club_id=c.id AND m.user_id=rowlens_user_id()
 WHERE m.user_id IS NOT NULL OR rowlens_platform_admin()
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_club_directory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'slug',slug) ORDER BY name),'[]'::jsonb)
 FROM club WHERE rowlens_user_id() IS NOT NULL
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_my_applications() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'clubId',a.club_id,'name',c.name,'status',a.status)),'[]'::jsonb)
 FROM membership_application a JOIN club c ON c.id=a.club_id WHERE a.user_id=rowlens_user_id()
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_apply_to_club(p_club uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=rowlens_user_id() AND verified_at IS NOT NULL
 AND first_name IS NOT NULL AND last_name IS NOT NULL) THEN RETURN false; END IF;
 PERFORM 1 FROM club WHERE id=p_club; IF NOT FOUND THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM membership WHERE club_id=p_club AND user_id=rowlens_user_id()) THEN RETURN false; END IF;
 INSERT INTO membership_application(club_id,user_id) VALUES(p_club,rowlens_user_id())
 ON CONFLICT(club_id,user_id) DO UPDATE SET status='pending',decided_by=NULL,updated_at=now()
 WHERE membership_application.status='cancelled'
 OR (membership_application.status='rejected' AND membership_application.updated_at<now()-interval '7 days');
 RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_cancel_application(p_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE membership_application SET status='cancelled',updated_at=now()
 WHERE id=p_id AND user_id=rowlens_user_id() AND status='pending'; RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_admission_list() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'userId',u.id,'name',u.display_name,'email',u.email,'status',a.status) ORDER BY a.created_at),'[]'::jsonb)
 FROM membership_application a JOIN app_user u ON u.id=a.user_id
 WHERE a.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_admin_member() AND a.status='pending'
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_decide_application(p_id uuid,p_approve boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a membership_application%ROWTYPE; cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||cid::text,0));
 IF NOT rowlens_admin_member() THEN RETURN false; END IF;
 SELECT * INTO a FROM membership_application WHERE id=p_id AND club_id=cid AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_approve THEN
 INSERT INTO membership(club_id,user_id,roles) VALUES(cid,a.user_id,ARRAY['rower']) ON CONFLICT DO NOTHING;
 INSERT INTO club_access(club_id,email,roles,added_by_user_id)
 SELECT cid,u.email,m.roles,rowlens_user_id() FROM app_user u JOIN membership m ON m.user_id=u.id AND m.club_id=cid WHERE u.id=a.user_id
 ON CONFLICT(club_id,email) DO UPDATE SET roles=excluded.roles,updated_at=now();
 END IF;
 UPDATE membership_application SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
 decided_by=rowlens_user_id(),updated_at=now() WHERE id=a.id;
 INSERT INTO platform_audit(actor_user_id,action,target) VALUES(rowlens_user_id(),
 CASE WHEN p_approve THEN 'membership.approved' ELSE 'membership.rejected' END,cid::text||':'||a.user_id::text);
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_manage_club(p_id uuid,p_slug text,p_name text,p_admin uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid;
BEGIN
 IF NOT rowlens_platform_admin() THEN RETURN NULL; END IF;
 IF p_slug !~ '^[a-z0-9-]{1,64}$' OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN RETURN NULL; END IF;
 IF p_admin IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_user WHERE id=p_admin AND verified_at IS NOT NULL) THEN RETURN NULL; END IF;
 IF p_id IS NULL THEN INSERT INTO club(slug,name) VALUES(p_slug,btrim(p_name)) RETURNING id INTO cid;
 ELSE UPDATE club SET name=btrim(p_name) WHERE id=p_id RETURNING id INTO cid; END IF;
 IF cid IS NULL THEN RETURN NULL; END IF;
 IF p_admin IS NOT NULL THEN
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||cid::text,0));
 INSERT INTO membership(club_id,user_id,roles) VALUES(cid,p_admin,ARRAY['admin'])
 ON CONFLICT(club_id,user_id) DO UPDATE SET roles=CASE WHEN 'admin'=ANY(membership.roles) THEN membership.roles ELSE array_append(membership.roles,'admin') END;
 INSERT INTO club_access(club_id,email,roles,added_by_user_id)
 SELECT cid,email,ARRAY['admin'],rowlens_user_id() FROM app_user WHERE id=p_admin
 ON CONFLICT(club_id,email) DO UPDATE SET roles=CASE WHEN 'admin'=ANY(club_access.roles) THEN club_access.roles ELSE array_append(club_access.roles,'admin') END;
 END IF;
 INSERT INTO platform_audit(actor_user_id,action,target) VALUES(rowlens_user_id(),'club.saved',cid::text);
 RETURN cid;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_platform_users() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'name',display_name) ORDER BY display_name),'[]'::jsonb)
 FROM app_user WHERE rowlens_platform_admin() AND verified_at IS NOT NULL
$$;
--> statement-breakpoint
-- Preserve membership-checked private feedback; the platform helper never grants another tenant.
-- Token possession is validated by the account gate before this context is installed.
CREATE OR REPLACE FUNCTION rowlens_user_settings(p_user uuid DEFAULT rowlens_user_id()) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('firstName',u.first_name,'lastName',u.last_name,
 'defaultBoatType',u.default_boat_type,'revision',u.settings_revision,
 'preferences',jsonb_build_object('language',u.language,'theme',u.theme,
 'notesVisible',u.notes_visible,'noteHoldSeconds',u.note_hold_seconds,'driveMiddle',u.drive_middle))
 FROM app_user u WHERE u.id=p_user AND rowlens_user_id() IS NOT NULL
 AND (p_user=rowlens_user_id() OR rowlens_platform_admin() OR (rowlens_admin_member() AND EXISTS(
 SELECT 1 FROM membership m WHERE m.user_id=p_user AND m.club_id=nullif(current_setting('app.club_id',true),'')::uuid)))
$$;
--> statement-breakpoint
-- Explicit elevation audit; never stores personal data or media payloads.
CREATE FUNCTION rowlens_audit_platform(p_action text,p_target text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF rowlens_platform_admin() THEN INSERT INTO platform_audit(actor_user_id,action,target)
 VALUES(rowlens_user_id(),left(p_action,120),left(p_target,180)); END IF;
END $$;
--> statement-breakpoint
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
 'rowlens_platform_admin','rowlens_account_issue','rowlens_account_verify','rowlens_account_session','rowlens_account_logout',
 'rowlens_account_clubs','rowlens_club_directory','rowlens_my_applications','rowlens_apply_to_club','rowlens_cancel_application',
 'rowlens_admission_list','rowlens_decide_application','rowlens_manage_club','rowlens_platform_users','rowlens_audit_platform') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO rowlens_app',f.sig);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_account_profile(p_csrf text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',u.id,'email',u.email,'displayName',u.display_name,'locale',u.locale,
 'firstName',u.first_name,'lastName',u.last_name,'defaultBoatType',u.default_boat_type,'csrfHash',p_csrf,
 'platformAdmin',rowlens_platform_admin()) FROM app_user u WHERE u.id=rowlens_user_id()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_account_profile(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_account_profile(text) TO rowlens_app;
--> statement-breakpoint
CREATE FUNCTION rowlens_legacy_logout(p_token text,p_others boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_others THEN UPDATE account_session SET revoked_at=now() WHERE user_id=rowlens_user_id() AND token_hash<>p_token; END IF;
 UPDATE user_session SET revoked_at=now() WHERE user_id=rowlens_user_id()
 AND CASE WHEN p_others THEN token_hash<>p_token ELSE token_hash=p_token END; RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_legacy_logout(text,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_legacy_logout(text,boolean) TO rowlens_app;
--> statement-breakpoint
-- Transitional projection: only verified, admitted accounts can become NEW sporting targets.
-- Existing identifiers and unresolved historical people remain untouched until explicit mapping.
CREATE FUNCTION rowlens_sync_account_targets() RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid;
BEGIN
 IF NOT rowlens_platform_admin() AND NOT EXISTS(SELECT 1 FROM membership WHERE club_id=cid AND user_id=rowlens_user_id()) THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-targets:'||cid::text,0));
 UPDATE rower r SET display_name=left(u.display_name,60),updated_at=now()
 FROM app_user u WHERE r.club_id=cid AND r.user_id=u.id AND u.verified_at IS NOT NULL AND u.display_name<>'';
 INSERT INTO rower(club_id,user_id,display_name)
 SELECT cid,u.id,left(u.display_name,60) FROM membership m JOIN app_user u ON u.id=m.user_id
 WHERE m.club_id=cid AND u.verified_at IS NOT NULL AND u.first_name IS NOT NULL AND u.last_name IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM rower r WHERE r.club_id=cid AND r.user_id=u.id);
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_account_target(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM rower r JOIN app_user u ON u.id=r.user_id
 JOIN membership m ON m.user_id=u.id AND m.club_id=r.club_id
 WHERE r.id=p_id AND r.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND r.archived_at IS NULL AND u.verified_at IS NOT NULL AND 'rower'=ANY(m.roles))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_sync_account_targets(),rowlens_account_target(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_sync_account_targets(),rowlens_account_target(uuid) TO rowlens_app;

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
 IF rowlens_admin_member() AND EXISTS(SELECT 1 FROM club WHERE id=nullif(current_setting('app.club_id',true),'')::uuid) THEN
   INSERT INTO user_settings_audit(club_id,subject_user_id,actor_user_id,changed_keys)
   VALUES(nullif(current_setting('app.club_id',true),'')::uuid,p_user,rowlens_user_id(),changed);
 END IF;
 RETURN rowlens_user_settings(p_user);
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_rower_targets(p_ids uuid[]) RETURNS TABLE(id uuid,archived_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,r.archived_at FROM rower r WHERE r.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND r.id=ANY(p_ids) AND (current_setting('app.unified_users',true) IS DISTINCT FROM 'true' OR rowlens_account_target(r.id))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_legacy_people() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.display_name) ORDER BY r.display_name),'[]'::jsonb)
 FROM rower r WHERE r.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND r.user_id IS NULL
 AND rowlens_admin_member() AND (r.archived_at IS NULL OR EXISTS(SELECT 1 FROM lineup_seat WHERE rower_id=r.id)
 OR EXISTS(SELECT 1 FROM angle_measure WHERE rower_id=r.id) OR EXISTS(SELECT 1 FROM moment_rower WHERE rower_id=r.id)
 OR EXISTS(SELECT 1 FROM moment_share WHERE rower_id=r.id))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_link_legacy_person(p_person uuid,p_user uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid; oldid uuid; uname text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||cid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-targets:'||cid::text,0));
 IF NOT rowlens_admin_member() THEN RETURN false; END IF;
 SELECT u.display_name INTO uname FROM app_user u JOIN membership m ON m.user_id=u.id
 WHERE m.club_id=cid AND u.id=p_user AND u.verified_at IS NOT NULL AND u.display_name<>'';
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM rower WHERE id=p_person AND club_id=cid AND user_id IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT id INTO oldid FROM rower WHERE club_id=cid AND user_id=p_user FOR UPDATE;
 IF oldid IS NOT NULL THEN
 -- Never discard two distinct seats, recipients or measurements during identity resolution.
 IF EXISTS(SELECT 1 FROM lineup_seat a JOIN lineup_seat b USING(session_id) WHERE a.rower_id=p_person AND b.rower_id=oldid)
 OR EXISTS(SELECT 1 FROM angle_measure a JOIN angle_measure b USING(video_id,frame,joint) WHERE a.rower_id=p_person AND b.rower_id=oldid)
 OR EXISTS(SELECT 1 FROM moment_rower a JOIN moment_rower b USING(moment_id) WHERE a.rower_id=p_person AND b.rower_id=oldid)
 OR EXISTS(SELECT 1 FROM moment_share a JOIN moment_share b USING(moment_id) WHERE a.rower_id=p_person AND b.rower_id=oldid)
 THEN RETURN false; END IF;
 UPDATE lineup_seat SET rower_id=p_person WHERE club_id=cid AND rower_id=oldid;
 UPDATE angle_measure SET rower_id=p_person WHERE club_id=cid AND rower_id=oldid;
 UPDATE moment_rower SET rower_id=p_person WHERE club_id=cid AND rower_id=oldid;
 UPDATE moment_share SET rower_id=p_person WHERE club_id=cid AND rower_id=oldid;
 -- Historical event IDs stay as recorded; no audit history is rewritten.
 UPDATE rower SET user_id=NULL,archived_at=now(),updated_at=now() WHERE id=oldid;
 END IF;
 UPDATE rower SET user_id=p_user,display_name=left(uname,60),updated_at=now() WHERE id=p_person;
 INSERT INTO platform_audit(actor_user_id,action,target) VALUES(rowlens_user_id(),'identity.linked',cid::text||':'||p_person::text||':'||p_user::text);
 RETURN true;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_legacy_people(),rowlens_link_legacy_person(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_legacy_people(),rowlens_link_legacy_person(uuid,uuid) TO rowlens_app;
--> statement-breakpoint
CREATE FUNCTION rowlens_admit_account(p_email text,p_roles text[]) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid; uid uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||cid::text,0));
 IF NOT rowlens_admin_member() OR NOT rowlens_valid_roles(p_roles) THEN RETURN 'not_found'; END IF;
 SELECT id INTO uid FROM app_user WHERE email=p_email AND verified_at IS NOT NULL;
 IF NOT FOUND THEN RETURN 'account_required'; END IF;
 IF uid=rowlens_user_id() AND NOT 'admin'=ANY(p_roles) AND EXISTS(SELECT 1 FROM membership WHERE club_id=cid AND user_id=uid AND 'admin'=ANY(roles)) THEN RETURN 'self'; END IF;
 IF NOT 'admin'=ANY(p_roles) AND EXISTS(SELECT 1 FROM membership WHERE club_id=cid AND user_id=uid AND 'admin'=ANY(roles))
 AND NOT EXISTS(SELECT 1 FROM membership WHERE club_id=cid AND user_id<>uid AND 'admin'=ANY(roles)) THEN RETURN 'last_admin'; END IF;

 INSERT INTO club_access(club_id,email,roles,added_by_user_id) VALUES(cid,p_email,p_roles,rowlens_user_id()) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN 'exists'; END IF;
 INSERT INTO membership(club_id,user_id,roles) VALUES(cid,uid,p_roles) ON CONFLICT(club_id,user_id) DO UPDATE SET roles=excluded.roles;
 UPDATE membership_application SET status='approved',decided_by=rowlens_user_id(),updated_at=now() WHERE club_id=cid AND user_id=uid AND status='pending';
 INSERT INTO platform_audit(actor_user_id,action,target) VALUES(rowlens_user_id(),'membership.admitted',cid::text||':'||uid::text);
 RETURN 'ok';
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_admit_account(text,text[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_admit_account(text,text[]) TO rowlens_app;

--> statement-breakpoint
-- Keep the pilot UUID and slug, so existing media, data and links survive.
UPDATE club SET name='WVIJburg' WHERE slug='pilot' AND name='Pilot';

--> statement-breakpoint
CREATE FUNCTION rowlens_share_target(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM rower r JOIN app_user u ON u.id=r.user_id
 JOIN membership m ON m.user_id=u.id AND m.club_id=r.club_id
 WHERE r.id=p_id AND r.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND r.archived_at IS NULL AND u.verified_at IS NOT NULL)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_share_targets(p_ids uuid[]) RETURNS TABLE(id uuid,archived_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,r.archived_at FROM rower r WHERE r.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND r.id=ANY(p_ids) AND (current_setting('app.unified_users',true) IS DISTINCT FROM 'true' OR rowlens_share_target(r.id))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_platform_audit_log() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM (SELECT * FROM platform_audit
 WHERE rowlens_platform_admin() ORDER BY at DESC LIMIT 1000) a
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_share_target(uuid),rowlens_share_targets(uuid[]),rowlens_platform_audit_log() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_share_target(uuid),rowlens_share_targets(uuid[]),rowlens_platform_audit_log() TO rowlens_app;
