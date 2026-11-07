CREATE TABLE "account_email_change" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"scope_club_id" uuid,
	"email" text NOT NULL,
	"old_email" text NOT NULL,
	"revision" integer NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_email_change" ADD CONSTRAINT "account_email_change_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_email_change" ADD CONSTRAINT "account_email_change_actor_user_id_app_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_email_change" ADD CONSTRAINT "account_email_change_scope_club_id_club_id_fk" FOREIGN KEY ("scope_club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
REVOKE ALL ON account_email_change FROM rowlens_app;
--> statement-breakpoint
CREATE FUNCTION rowlens_manage_account(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_platform_admin() OR (rowlens_admin_member() AND EXISTS(SELECT 1 FROM membership
 WHERE club_id=nullif(current_setting('app.club_id',true),'')::uuid AND user_id=p_user))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_manage_directory() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'id',u.id,'firstName',u.first_name,'lastName',u.last_name,'email',u.email,
 'platformAdmin',EXISTS(SELECT 1 FROM platform_admin p WHERE p.user_id=u.id),
 'defaultBoatType',u.default_boat_type,'language',u.language,'theme',u.theme,
 'notesVisible',u.notes_visible,'noteHoldSeconds',u.note_hold_seconds,'driveMiddle',u.drive_middle,
 'createdAt',u.created_at,'verifiedAt',u.verified_at,'revision',u.settings_revision,
 'lastSeenAt',(SELECT max(s.last_seen_at) FROM user_session s WHERE s.user_id=u.id AND
 (rowlens_platform_admin() OR s.club_id=nullif(current_setting('app.club_id',true),'')::uuid)),
 'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('clubId',c.id,'name',c.name,'roles',m.roles,'archived',c.archived_at IS NOT NULL) ORDER BY c.name,c.id)
 FROM membership m JOIN club c ON c.id=m.club_id WHERE m.user_id=u.id AND
 (rowlens_platform_admin() OR c.id=nullif(current_setting('app.club_id',true),'')::uuid)),'[]'::jsonb),
 'applications',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'clubId',c.id,'name',c.name,'status',a.status) ORDER BY c.name,c.id)
 FROM membership_application a JOIN club c ON c.id=a.club_id WHERE a.user_id=u.id AND
 (rowlens_platform_admin() OR c.id=nullif(current_setting('app.club_id',true),'')::uuid)),'[]'::jsonb)
 ) ORDER BY u.id),'[]'::jsonb) FROM app_user u WHERE u.verified_at IS NOT NULL AND rowlens_manage_account(u.id)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_manage_applications() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'clubId',c.id,'clubName',c.name,'userId',u.id,'name',u.display_name,'email',u.email)
 ORDER BY a.created_at,a.id),'[]'::jsonb) FROM membership_application a JOIN app_user u ON u.id=a.user_id
 JOIN club c ON c.id=a.club_id WHERE a.status='pending' AND c.archived_at IS NULL AND
 (rowlens_platform_admin() OR (rowlens_admin_member() AND c.id=nullif(current_setting('app.club_id',true),'')::uuid))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_set_platform_authority(p_user uuid,p_enabled boolean,p_expected boolean) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE present boolean;
BEGIN
 IF p_enabled IS NULL OR p_expected IS NULL THEN RETURN 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-platform-authority',0));
 IF NOT rowlens_platform_admin() THEN RETURN 'forbidden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=p_user AND verified_at IS NOT NULL) THEN RETURN 'not_found'; END IF;
 SELECT EXISTS(SELECT 1 FROM platform_admin WHERE user_id=p_user) INTO present;
 IF present<>p_expected THEN RETURN 'conflict'; END IF;
 IF present=p_enabled THEN RETURN 'ok'; END IF;
 IF NOT p_enabled AND (p_user=rowlens_user_id() OR (SELECT count(*) FROM platform_admin)<2) THEN RETURN 'self'; END IF;
 IF p_enabled THEN INSERT INTO platform_admin(user_id) VALUES(p_user);
 ELSE DELETE FROM platform_admin WHERE user_id=p_user; END IF;
 INSERT INTO platform_audit(actor_user_id,action,target) VALUES(rowlens_user_id(),
 CASE WHEN p_enabled THEN 'platform.granted' ELSE 'platform.revoked' END,p_user::text);
 RETURN 'ok';
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_request_email_change(p_id uuid,p_user uuid,p_email text,p_revision integer,p_hash text,p_reserved text[]) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u app_user%ROWTYPE; cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||p_user::text,0));
 IF NOT rowlens_platform_admin() THEN
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||cid::text,0)); END IF;
 IF NOT rowlens_manage_account(p_user) THEN RETURN 'forbidden'; END IF;
 SELECT * INTO u FROM app_user WHERE id=p_user FOR UPDATE;
 IF NOT FOUND OR u.verified_at IS NULL THEN RETURN 'not_found'; END IF;
 IF p_revision IS NULL OR u.settings_revision<>p_revision THEN RETURN 'conflict'; END IF;
 IF u.email=ANY(p_reserved) OR p_email=ANY(p_reserved) THEN RETURN 'server_managed'; END IF;
 IF p_email IS NULL OR p_email<>lower(p_email) OR p_email NOT LIKE '%_@_%' OR length(p_email)>254 THEN RETURN 'invalid'; END IF;
 IF EXISTS(SELECT 1 FROM app_user WHERE email=p_email) OR EXISTS(SELECT 1 FROM club_access WHERE email=p_email) OR EXISTS(SELECT 1 FROM rower WHERE email=p_email AND user_id IS DISTINCT FROM p_user) THEN RETURN 'exists'; END IF;
 DELETE FROM account_email_change WHERE user_id=p_user;
 INSERT INTO account_email_change(id,user_id,actor_user_id,scope_club_id,email,old_email,revision,code_hash,expires_at)
 VALUES(p_id,p_user,rowlens_user_id(),CASE WHEN rowlens_platform_admin() THEN NULL ELSE cid END,p_email,u.email,p_revision,p_hash,now()+interval '10 minutes');
 INSERT INTO platform_audit(actor_user_id,action,target) VALUES(rowlens_user_id(),'account.email.requested',p_user::text);
 RETURN 'ok';
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_confirm_email_change(p_id uuid,p_hash text,p_reserved text[]) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r account_email_change%ROWTYPE; u app_user%ROWTYPE; cid uuid; mailbox text;
BEGIN
 SELECT * INTO r FROM account_email_change WHERE id=p_id AND (actor_user_id=rowlens_user_id() OR user_id=rowlens_user_id());
 IF NOT FOUND THEN RETURN 'invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||r.user_id::text,0));
 FOR mailbox IN SELECT value FROM (VALUES(r.old_email),(r.email)) x(value) ORDER BY value LOOP
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-mailbox:'||mailbox,0)); END LOOP;
 -- Match admission/profile lock order: every affected club, then the central account.
 FOR cid IN SELECT x.club_id FROM (
 SELECT club_id FROM membership WHERE user_id=r.user_id UNION SELECT club_id FROM club_access WHERE email=r.old_email
 UNION SELECT r.scope_club_id WHERE r.scope_club_id IS NOT NULL) x ORDER BY x.club_id LOOP
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||cid::text,0)); END LOOP;
 SELECT * INTO r FROM account_email_change WHERE id=p_id AND (actor_user_id=rowlens_user_id() OR user_id=rowlens_user_id()) FOR UPDATE;
 IF NOT FOUND OR r.expires_at<=now() OR r.attempts>=5 THEN RETURN 'invalid'; END IF;
 IF rowlens_user_id()<>r.user_id AND NOT rowlens_platform_admin() THEN RETURN 'owner_confirmation_required'; END IF;
 IF r.scope_club_id IS NULL THEN
   IF NOT EXISTS(SELECT 1 FROM platform_admin WHERE user_id=r.actor_user_id) THEN RETURN 'forbidden'; END IF;
 ELSE
   IF NOT EXISTS(SELECT 1 FROM club c JOIN membership a ON a.club_id=c.id AND a.user_id=r.actor_user_id
     JOIN membership t ON t.club_id=c.id AND t.user_id=r.user_id
     WHERE c.id=r.scope_club_id AND c.archived_at IS NULL AND 'admin'=ANY(a.roles)) THEN RETURN 'forbidden'; END IF;
 END IF;
 IF p_hash IS NULL OR r.code_hash<>p_hash THEN UPDATE account_email_change SET attempts=attempts+1 WHERE id=p_id; RETURN 'invalid'; END IF;
 SELECT * INTO u FROM app_user WHERE id=r.user_id FOR UPDATE;
 IF u.settings_revision<>r.revision OR u.email<>r.old_email THEN RETURN 'conflict'; END IF;
 IF u.email=ANY(p_reserved) OR r.email=ANY(p_reserved) THEN RETURN 'server_managed'; END IF;
 IF EXISTS(SELECT 1 FROM app_user WHERE email=r.email) OR EXISTS(SELECT 1 FROM club_access WHERE email=r.email) OR EXISTS(SELECT 1 FROM rower WHERE email=r.email AND user_id IS DISTINCT FROM r.user_id) THEN RETURN 'exists'; END IF;
 UPDATE club_access SET email=r.email,updated_at=now() WHERE email=r.old_email;
 UPDATE rower SET email=r.email WHERE user_id=r.user_id;
 UPDATE app_user SET email=r.email,verified_at=now(),settings_revision=settings_revision+1,settings_updated_at=now() WHERE id=r.user_id;
 UPDATE account_session SET revoked_at=now() WHERE user_id=r.user_id;
 UPDATE user_session SET revoked_at=now() WHERE user_id=r.user_id;
 DELETE FROM account_login_code WHERE email IN (r.old_email,r.email);
 DELETE FROM login_code WHERE user_id=r.user_id;
 DELETE FROM account_email_change WHERE user_id=r.user_id;
 INSERT INTO platform_audit(actor_user_id,action,target) VALUES(rowlens_user_id(),'account.email.changed',r.user_id::text);
 RETURN 'ok';
END $$;
--> statement-breakpoint
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('rowlens_manage_account','rowlens_manage_directory','rowlens_manage_applications','rowlens_set_platform_authority','rowlens_request_email_change','rowlens_confirm_email_change') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO rowlens_app',f.sig);
 END LOOP;
END $$;

--> statement-breakpoint
CREATE FUNCTION rowlens_email_change_view(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',r.id,'email',r.email,'oldEmail',r.old_email)
 FROM account_email_change r WHERE r.id=p_id AND r.user_id=rowlens_user_id() AND r.expires_at>now()
$$;
REVOKE ALL ON FUNCTION rowlens_email_change_view(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rowlens_email_change_view(uuid) TO rowlens_app;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_admit_account(p_email text,p_roles text[]) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid; uid uuid;
BEGIN
 SELECT id INTO uid FROM app_user WHERE email=p_email AND verified_at IS NOT NULL;
 IF uid IS NULL THEN RETURN 'account_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||uid::text,0));
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=uid AND email=p_email AND verified_at IS NOT NULL) THEN RETURN 'not_found'; END IF;
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
CREATE OR REPLACE FUNCTION rowlens_decide_application(p_id uuid,p_approve boolean) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a membership_application%ROWTYPE; cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid;
BEGIN
 SELECT * INTO a FROM membership_application WHERE id=p_id AND club_id=cid AND status='pending';
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||a.user_id::text,0));
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
CREATE OR REPLACE FUNCTION rowlens_manage_club(p_id uuid,p_slug text,p_name text,p_admin uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid;
BEGIN
 IF NOT rowlens_platform_admin() THEN RETURN NULL; END IF;
 IF p_slug !~ '^[a-z0-9-]{1,64}$' OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 80 THEN RETURN NULL; END IF;
 IF p_admin IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||p_admin::text,0)); END IF;
 IF NOT rowlens_platform_admin() THEN RETURN NULL; END IF;
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
CREATE OR REPLACE FUNCTION rowlens_auth_ensure_user(
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
 identity_uid uuid;
	v_user_id uuid;
	v_club_id uuid;
	v_roles text[];
BEGIN
 SELECT u.id INTO identity_uid FROM app_user u WHERE u.email=p_email;
 IF identity_uid IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||identity_uid::text,0)); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-mailbox:'||p_email,0));
 IF identity_uid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_user u WHERE u.id=identity_uid AND u.email=p_email) THEN RETURN; END IF;
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
CREATE OR REPLACE FUNCTION rowlens_account_verify(p_email text,p_hash text,p_token text,p_csrf text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c account_login_code%ROWTYPE; uid uuid;
BEGIN
 IF p_hash IS NULL OR p_token IS NULL OR p_csrf IS NULL THEN RETURN false; END IF;
 SELECT id INTO uid FROM app_user WHERE email=p_email;
 IF uid IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||uid::text,0)); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-mailbox:'||p_email,0));
 IF uid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_user WHERE id=uid AND email=p_email) THEN RETURN false; END IF;
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
CREATE OR REPLACE FUNCTION rowlens_adopt_legacy_session(p_token text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s user_session%ROWTYPE; uid uuid;
BEGIN
 SELECT user_id INTO uid FROM user_session WHERE token_hash=p_token AND revoked_at IS NULL AND expires_at>now();
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||uid::text,0));
 SELECT * INTO s FROM user_session WHERE token_hash=p_token AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO account_session(user_id,token_hash,csrf_hash,expires_at)
 VALUES(s.user_id,s.token_hash,s.csrf_hash,s.expires_at) ON CONFLICT(token_hash) DO NOTHING;
 UPDATE app_user SET verified_at=coalesce(verified_at,now()) WHERE id=s.user_id;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_admit_account_bound(p_user uuid,p_email text,p_roles text[],p_expected text[]) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE uid uuid:=p_user; cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid; actual text[];
BEGIN
 IF uid IS NULL THEN SELECT id INTO uid FROM app_user WHERE email=p_email AND verified_at IS NOT NULL; END IF;
 IF uid IS NULL THEN RETURN 'account_required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||uid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||cid::text,0));
 IF NOT rowlens_admin_member() THEN RETURN 'not_found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=uid AND email=p_email AND verified_at IS NOT NULL) THEN RETURN 'not_found'; END IF;
 SELECT roles INTO actual FROM membership WHERE club_id=cid AND user_id=uid;
 IF p_expected IS NOT NULL THEN
  IF actual IS NULL OR (SELECT array_agg(r ORDER BY r) FROM unnest(actual) r) IS DISTINCT FROM
  (SELECT array_agg(r ORDER BY r) FROM unnest(p_expected) r) THEN RETURN 'access_changed'; END IF;
 ELSIF p_user IS NOT NULL AND actual IS NOT NULL THEN RETURN 'access_changed'; END IF;
 RETURN rowlens_admit_account(p_email,p_roles);
END $$;
REVOKE ALL ON FUNCTION rowlens_admit_account_bound(uuid,text,text[],text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rowlens_admit_account_bound(uuid,text,text[],text[]) TO rowlens_app;
