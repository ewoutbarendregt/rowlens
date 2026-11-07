CREATE TABLE "account_registration" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"requested_club_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_login_code" ADD COLUMN "registration_id" uuid;--> statement-breakpoint
ALTER TABLE "account_login_code" ADD COLUMN "requested_club_id" uuid;--> statement-breakpoint
ALTER TABLE "account_registration" ADD CONSTRAINT "account_registration_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_registration" ADD CONSTRAINT "account_registration_requested_club_id_club_id_fk" FOREIGN KEY ("requested_club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_login_code" ADD CONSTRAINT "account_login_code_requested_club_id_club_id_fk" FOREIGN KEY ("requested_club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Global authentication state: account/registration proofs are not tenant content.
REVOKE ALL ON account_registration FROM rowlens_app;
--> statement-breakpoint
CREATE FUNCTION rowlens_registration_clubs() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb)
 FROM club WHERE archived_at IS NULL
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_registration_issue(p_email text,p_hash text,p_locale text,p_id uuid,p_club uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_email IS NULL OR p_hash IS NULL OR p_id IS NULL OR p_locale NOT IN ('nl','en') OR p_locale IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-mailbox:'||p_email,0));
 IF p_club IS NOT NULL THEN
 PERFORM 1 FROM club WHERE id=p_club AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 END IF;
 INSERT INTO account_login_code(email,code_hash,locale,expires_at,registration_id,requested_club_id)
 VALUES(p_email,p_hash,p_locale,now()+interval '10 minutes',p_id,p_club)
 ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,locale=excluded.locale,
 expires_at=excluded.expires_at,attempts=0,used_at=NULL,registration_id=p_id,requested_club_id=p_club;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_account_issue(p_email text,p_hash text,p_locale text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO account_login_code(email,code_hash,locale,expires_at) VALUES(p_email,p_hash,p_locale,now()+interval '10 minutes')
 ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,locale=excluded.locale,
 expires_at=excluded.expires_at,attempts=0,used_at=NULL,registration_id=NULL,requested_club_id=NULL
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_login_issue(p_email text,p_hash text,p_locale text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-mailbox:'||p_email,0));
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE email=p_email AND verified_at IS NOT NULL) THEN RETURN false; END IF;
 PERFORM rowlens_account_issue(p_email,p_hash,p_locale);
 RETURN true;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_account_verify(p_email text,p_hash text,p_token text,p_csrf text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c account_login_code%ROWTYPE; uid uuid;
BEGIN
 IF p_hash IS NULL OR p_token IS NULL OR p_csrf IS NULL THEN RETURN false; END IF;
 SELECT id INTO uid FROM app_user WHERE email=p_email AND verified_at IS NOT NULL;
 IF uid IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||uid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-mailbox:'||p_email,0));
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=uid AND email=p_email AND verified_at IS NOT NULL) THEN RETURN false; END IF;
 SELECT * INTO c FROM account_login_code WHERE email=p_email FOR UPDATE;
 IF NOT FOUND OR c.registration_id IS NOT NULL OR c.used_at IS NOT NULL OR c.expires_at<=now() OR c.attempts>=5 THEN RETURN false; END IF;
 IF c.code_hash<>p_hash THEN UPDATE account_login_code SET attempts=attempts+1 WHERE email=p_email; RETURN false; END IF;
 UPDATE account_login_code SET used_at=now() WHERE email=p_email;
 INSERT INTO account_session(user_id,token_hash,csrf_hash,expires_at) VALUES(uid,p_token,p_csrf,now()+interval '30 days');
 RETURN true;
END $$;
--> statement-breakpoint
-- Private helper shared by verified signup and the authenticated account application route.
CREATE FUNCTION rowlens_submit_application(p_user uuid,p_club uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_user IS NULL OR p_club IS NULL THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||p_user::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||p_club::text,0));
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=p_user AND verified_at IS NOT NULL) THEN RETURN false; END IF;
 PERFORM 1 FROM club WHERE id=p_club AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM membership WHERE club_id=p_club AND user_id=p_user) THEN RETURN false; END IF;
 INSERT INTO membership_application(club_id,user_id) VALUES(p_club,p_user)
 ON CONFLICT(club_id,user_id) DO UPDATE SET status='pending',decided_by=NULL,updated_at=now()
 WHERE membership_application.status='cancelled'
 OR (membership_application.status='rejected' AND membership_application.updated_at<now()-interval '7 days');
 RETURN FOUND;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_apply_to_club(p_club uuid) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_submit_application(rowlens_user_id(),p_club)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_registration_verify(p_email text,p_hash text,p_id uuid,p_token text,p_csrf text) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c account_login_code%ROWTYPE; uid uuid; original uuid;
BEGIN
 IF p_email IS NULL OR p_hash IS NULL OR p_id IS NULL OR p_token IS NULL OR p_csrf IS NULL THEN RETURN 'invalid'; END IF;
 SELECT id INTO original FROM app_user WHERE email=p_email;
 uid:=coalesce(original,gen_random_uuid());
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||uid::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-mailbox:'||p_email,0));
 IF original IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_user WHERE id=original AND email=p_email)
 OR original IS NULL AND EXISTS(SELECT 1 FROM app_user WHERE email=p_email) THEN RETURN 'invalid'; END IF;
 SELECT * INTO c FROM account_login_code WHERE email=p_email FOR UPDATE;
 IF NOT FOUND OR c.registration_id IS DISTINCT FROM p_id OR c.used_at IS NOT NULL OR c.expires_at<=now() OR c.attempts>=5 THEN RETURN 'invalid'; END IF;
 IF c.code_hash<>p_hash THEN UPDATE account_login_code SET attempts=attempts+1 WHERE email=p_email; RETURN 'invalid'; END IF;
 IF c.requested_club_id IS NOT NULL THEN
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||c.requested_club_id::text,0));
 PERFORM 1 FROM club WHERE id=c.requested_club_id AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN 'club_unavailable'; END IF;
 END IF;
 INSERT INTO app_user(id,email,display_name,locale,verified_at) VALUES(uid,p_email,'',c.locale,now())
 ON CONFLICT(email) DO UPDATE SET verified_at=coalesce(app_user.verified_at,now()) RETURNING id INTO uid;
 INSERT INTO account_registration(user_id,requested_club_id) VALUES(uid,c.requested_club_id) ON CONFLICT DO NOTHING;
 IF c.requested_club_id IS NOT NULL THEN PERFORM rowlens_submit_application(uid,c.requested_club_id); END IF;
 UPDATE account_login_code SET used_at=now() WHERE email=p_email;
 INSERT INTO account_session(user_id,token_hash,csrf_hash,expires_at) VALUES(uid,p_token,p_csrf,now()+interval '30 days');
 RETURN 'ok';
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_my_registration() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('clubId',r.requested_club_id,'clubName',c.name,'createdAt',r.created_at)
 FROM account_registration r LEFT JOIN club c ON c.id=r.requested_club_id WHERE r.user_id=rowlens_user_id()
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_manage_applications() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC,id),'[]'::jsonb) FROM (
 SELECT a.id,a.created_at,jsonb_build_object('id',a.id,'kind','club','clubId',c.id,'clubName',c.name,
 'userId',u.id,'name',u.display_name,'email',u.email,'createdAt',a.created_at,'status',a.status,'archived',c.archived_at IS NOT NULL) AS item
 FROM membership_application a JOIN app_user u ON u.id=a.user_id JOIN club c ON c.id=a.club_id
 WHERE u.verified_at IS NOT NULL AND (rowlens_platform_admin() OR
 (rowlens_admin_member() AND c.archived_at IS NULL AND c.id=nullif(current_setting('app.club_id',true),'')::uuid))
 UNION ALL
 SELECT r.user_id,r.created_at,jsonb_build_object('id',r.user_id,'kind','registration','clubId',c.id,'clubName',c.name,
 'userId',u.id,'name',u.display_name,'email',u.email,'createdAt',r.created_at,'status','registered','archived',c.archived_at IS NOT NULL)
 FROM account_registration r JOIN app_user u ON u.id=r.user_id LEFT JOIN club c ON c.id=r.requested_club_id
 WHERE rowlens_platform_admin() AND u.verified_at IS NOT NULL AND
 (r.requested_club_id IS NULL OR NOT EXISTS(SELECT 1 FROM membership_application a WHERE a.user_id=r.user_id AND a.club_id=r.requested_club_id))
 ) visible
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_admission_list() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'userId',u.id,'name',u.display_name,'email',u.email,'status',a.status,'createdAt',a.created_at) ORDER BY a.created_at),'[]'::jsonb)
 FROM membership_application a JOIN app_user u ON u.id=a.user_id
 WHERE a.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_admin_member() AND a.status='pending'
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_submit_application(uuid,uuid) FROM PUBLIC,rowlens_app;
--> statement-breakpoint
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('rowlens_registration_clubs','rowlens_registration_issue','rowlens_login_issue','rowlens_registration_verify','rowlens_my_registration') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO rowlens_app',f);
 END LOOP;
END $$;
