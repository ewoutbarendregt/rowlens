CREATE TABLE "club_application_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease" uuid,
	"locked_until" timestamp with time zone,
	"club_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	CONSTRAINT "club_notice_recipient_unique" UNIQUE("application_id","recipient_id")
);
--> statement-breakpoint
ALTER TABLE "club_application_notice" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clubless_application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubless_application_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "clubless_application_notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease" uuid,
	"locked_until" timestamp with time zone,
	"application_id" uuid NOT NULL,
	CONSTRAINT "clubless_notice_recipient_unique" UNIQUE("application_id","recipient_id")
);
--> statement-breakpoint
ALTER TABLE "account_registration" ADD COLUMN "initial_signup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "club_application_notice" ADD CONSTRAINT "club_application_notice_recipient_id_app_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_application_notice" ADD CONSTRAINT "club_application_notice_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_application_notice" ADD CONSTRAINT "club_application_notice_application_id_membership_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."membership_application"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubless_application" ADD CONSTRAINT "clubless_application_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubless_application" ADD CONSTRAINT "clubless_application_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubless_application_notice" ADD CONSTRAINT "clubless_application_notice_recipient_id_app_user_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubless_application_notice" ADD CONSTRAINT "clubless_application_notice_application_id_clubless_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."clubless_application"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "club_notice_tenant" ON "club_application_notice" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("club_application_notice"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("club_application_notice"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
CREATE POLICY "club_notice_private" ON "club_application_notice" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (false) WITH CHECK (false);--> statement-breakpoint
REVOKE ALL ON clubless_application,clubless_application_notice,club_application_notice FROM rowlens_app;
--> statement-breakpoint
ALTER TABLE clubless_application ADD CONSTRAINT clubless_status_check CHECK(status IN ('pending','approved','rejected'));
--> statement-breakpoint
-- Private enqueue functions run only inside verified admission transactions.
CREATE FUNCTION rowlens_enqueue_clubless(p_user uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE aid uuid;
BEGIN
 INSERT INTO clubless_application(user_id) VALUES(p_user) ON CONFLICT DO NOTHING RETURNING id INTO aid;
 IF aid IS NULL THEN RETURN false; END IF;
 INSERT INTO clubless_application_notice(application_id,recipient_id)
 SELECT aid,p.user_id FROM platform_admin p JOIN app_user u ON u.id=p.user_id WHERE u.verified_at IS NOT NULL;
 RETURN true;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_initial_admission(p_user uuid,p_club uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_club IS NULL THEN PERFORM rowlens_enqueue_clubless(p_user); RETURN; END IF;
 INSERT INTO club_application_notice(club_id,application_id,recipient_id)
 SELECT a.club_id,a.id,m.user_id FROM membership_application a
 JOIN membership m ON m.club_id=a.club_id AND 'admin'=ANY(m.roles)
 JOIN app_user u ON u.id=m.user_id AND u.verified_at IS NOT NULL
 WHERE a.user_id=p_user AND a.club_id=p_club AND a.status='pending' ON CONFLICT DO NOTHING;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_request_clubless() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-identity:'||rowlens_user_id()::text,0));
 IF NOT EXISTS(SELECT 1 FROM account_registration r JOIN membership_application a
 ON a.user_id=r.user_id AND a.club_id=r.requested_club_id
 WHERE r.user_id=rowlens_user_id() AND r.initial_signup AND a.status='rejected') THEN RETURN false; END IF;
 RETURN rowlens_enqueue_clubless(rowlens_user_id());
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_my_admission() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('request',(SELECT jsonb_build_object('id',id,'status',status) FROM clubless_application WHERE user_id=rowlens_user_id()),
 'canRequest', EXISTS(SELECT 1 FROM account_registration r JOIN membership_application a ON a.user_id=r.user_id AND a.club_id=r.requested_club_id
 WHERE r.user_id=rowlens_user_id() AND r.initial_signup AND a.status='rejected') AND NOT EXISTS(SELECT 1 FROM clubless_application WHERE user_id=rowlens_user_id()))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_clubless_requests() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind','clubless','clubId',NULL,'clubName',NULL,'userId',u.id,'name',u.display_name,'email',u.email,'createdAt',a.created_at,'status',a.status,'archived',false) ORDER BY a.created_at DESC),'[]'::jsonb)
 FROM clubless_application a JOIN app_user u ON u.id=a.user_id WHERE rowlens_platform_admin()
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_decide_clubless(p_id uuid,p_approve boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT rowlens_platform_admin() OR p_approve IS NULL THEN RETURN false; END IF;
 -- Serialize against the same lock used by platform grant/revocation.
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-platform-authority',0));
 IF NOT rowlens_platform_admin() THEN RETURN false; END IF;
 UPDATE clubless_application SET status=CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
 decided_by=rowlens_user_id(),updated_at=now() WHERE id=p_id AND status='pending';
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO platform_audit(actor_user_id,action,target) VALUES(rowlens_user_id(),
 CASE WHEN p_approve THEN 'clubless.approved' ELSE 'clubless.rejected' END,p_id::text);
 RETURN true;
END $$;
--> statement-breakpoint
-- Review endpoints expose only a currently authorized application's projection.
CREATE FUNCTION rowlens_review_application(p_id uuid,p_global boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN p_global THEN (SELECT jsonb_build_object('id',a.id,'name',u.display_name,'email',u.email,'status',a.status,'clubName',NULL)
 FROM clubless_application a JOIN app_user u ON u.id=a.user_id WHERE a.id=p_id AND rowlens_platform_admin())
 ELSE (SELECT jsonb_build_object('id',a.id,'name',u.display_name,'email',u.email,'status',a.status,'clubName',c.name)
 FROM membership_application a JOIN app_user u ON u.id=a.user_id JOIN club c ON c.id=a.club_id
 WHERE a.id=p_id AND a.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND c.archived_at IS NULL AND rowlens_admin_member()) END
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_claim_admission_notice() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n record; v_global boolean; ticket uuid; result jsonb;
BEGIN
 IF current_setting('app.service',true) IS DISTINCT FROM 'true' THEN RETURN NULL; END IF;
 FOREACH v_global IN ARRAY ARRAY[false,true] LOOP
 IF v_global THEN
  UPDATE clubless_application_notice SET state='dead' WHERE attempts>=5 AND state IN ('queued','sending') AND coalesce(locked_until,available_at)<=now();
  SELECT * INTO n FROM clubless_application_notice WHERE state IN ('queued','sending') AND attempts<5 AND available_at<=now() AND (locked_until IS NULL OR locked_until<=now()) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 ELSE
  UPDATE club_application_notice SET state='dead' WHERE attempts>=5 AND state IN ('queued','sending') AND coalesce(locked_until,available_at)<=now();
  SELECT * INTO n FROM club_application_notice WHERE state IN ('queued','sending') AND attempts<5 AND available_at<=now() AND (locked_until IS NULL OR locked_until<=now()) ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 END IF;
 IF NOT FOUND THEN CONTINUE; END IF;
 ticket:=gen_random_uuid();
 IF v_global THEN
  SELECT jsonb_build_object('id',n.id,'global',true,'lease',ticket,'clubId',NULL,'applicationId',a.id,'clubName',NULL,'email',u.email,'locale',u.locale) INTO result
  FROM clubless_application a JOIN platform_admin p ON p.user_id=n.recipient_id JOIN app_user u ON u.id=p.user_id AND u.verified_at IS NOT NULL
  WHERE a.id=n.application_id AND a.status='pending';
  UPDATE clubless_application_notice SET state=CASE WHEN result IS NULL THEN 'cancelled' ELSE 'sending' END,attempts=attempts+1,lease=ticket,locked_until=now()+interval '5 minutes' WHERE id=n.id;
 ELSE
  SELECT jsonb_build_object('id',n.id,'global',false,'lease',ticket,'clubId',a.club_id,'applicationId',a.id,'clubName',c.name,'email',u.email,'locale',u.locale) INTO result
  FROM membership_application a JOIN club c ON c.id=a.club_id AND c.archived_at IS NULL
  JOIN membership m ON m.club_id=a.club_id AND m.user_id=n.recipient_id AND 'admin'=ANY(m.roles)
  JOIN app_user u ON u.id=m.user_id AND u.verified_at IS NOT NULL
  WHERE a.id=n.application_id AND a.status='pending';
  UPDATE club_application_notice SET state=CASE WHEN result IS NULL THEN 'cancelled' ELSE 'sending' END,attempts=attempts+1,lease=ticket,locked_until=now()+interval '5 minutes' WHERE id=n.id;
 END IF;
 IF result IS NOT NULL THEN RETURN result; END IF;
 END LOOP;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_finish_admission_notice(p_id uuid,p_global boolean,p_lease uuid,p_success boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF current_setting('app.service',true) IS DISTINCT FROM 'true' THEN RETURN false; END IF;
 IF p_global THEN
 UPDATE clubless_application_notice SET state=CASE WHEN p_success THEN 'accepted' WHEN attempts>=5 THEN 'dead' ELSE 'queued' END,
 available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::int)),locked_until=NULL,lease=NULL
 WHERE id=p_id AND lease=p_lease AND state='sending' AND locked_until>now();
 ELSE
 UPDATE club_application_notice SET state=CASE WHEN p_success THEN 'accepted' WHEN attempts>=5 THEN 'dead' ELSE 'queued' END,
 available_at=now()+make_interval(secs=>least(3600,30*(2^attempts)::int)),locked_until=NULL,lease=NULL
 WHERE id=p_id AND lease=p_lease AND state='sending' AND locked_until>now();
 END IF;
 RETURN FOUND;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_enqueue_clubless(uuid),rowlens_initial_admission(uuid,uuid) FROM PUBLIC,rowlens_app;
--> statement-breakpoint
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('rowlens_request_clubless','rowlens_my_admission','rowlens_clubless_requests','rowlens_decide_clubless','rowlens_review_application','rowlens_claim_admission_notice','rowlens_finish_admission_notice') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO rowlens_app',f);
 END LOOP;
END $$;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_registration_verify(p_email text,p_hash text,p_id uuid,p_token text,p_csrf text) RETURNS text
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
 INSERT INTO account_registration(user_id,requested_club_id,initial_signup) VALUES(uid,c.requested_club_id,original IS NULL) ON CONFLICT DO NOTHING;
 IF c.requested_club_id IS NOT NULL THEN PERFORM rowlens_submit_application(uid,c.requested_club_id); END IF;
 IF original IS NULL THEN PERFORM rowlens_initial_admission(uid,c.requested_club_id); END IF;
 UPDATE account_login_code SET used_at=now() WHERE email=p_email;
 INSERT INTO account_session(user_id,token_hash,csrf_hash,expires_at) VALUES(uid,p_token,p_csrf,now()+interval '30 days');
 RETURN 'ok';
END $$;
