CREATE TABLE "session_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"recipient_user_id" uuid,
	"shared_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_share_scope_check" CHECK (("session_share"."scope"='club' and "session_share"."recipient_user_id" is null) or ("session_share"."scope"='member' and "session_share"."recipient_user_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "session_share" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session_share_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"recipient_user_id" uuid,
	"scope" text NOT NULL,
	"action" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_share_event_scope_check" CHECK (("session_share_event"."scope"='club' and "session_share_event"."recipient_user_id" is null) or ("session_share_event"."scope"='member' and "session_share_event"."recipient_user_id" is not null)),
	CONSTRAINT "session_share_event_action_check" CHECK ("session_share_event"."action" in ('grant','revoke'))
);
--> statement-breakpoint
ALTER TABLE "session_share_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rowing_session" ADD COLUMN "sharing_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "session_share" ADD CONSTRAINT "session_share_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_share" ADD CONSTRAINT "session_share_shared_by_user_id_app_user_id_fk" FOREIGN KEY ("shared_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_share" ADD CONSTRAINT "session_share_session_fk" FOREIGN KEY ("club_id","session_id") REFERENCES "public"."rowing_session"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_share" ADD CONSTRAINT "session_share_member_fk" FOREIGN KEY ("club_id","recipient_user_id") REFERENCES "public"."membership"("club_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_share_event" ADD CONSTRAINT "session_share_event_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_share_event" ADD CONSTRAINT "session_share_event_actor_user_id_app_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_share_club_unique" ON "session_share" USING btree ("club_id","session_id") WHERE "session_share"."scope"='club';--> statement-breakpoint
CREATE UNIQUE INDEX "session_share_member_unique" ON "session_share" USING btree ("club_id","session_id","recipient_user_id") WHERE "session_share"."scope"='member';--> statement-breakpoint
CREATE INDEX "session_share_event_session_idx" ON "session_share_event" USING btree ("club_id","session_id","at");--> statement-breakpoint
-- Training grants are current-club read permissions, never mutation capabilities.
CREATE FUNCTION rowlens_session_shared(p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT current_setting('app.training_permissions',true)='owner-or-staff'
 AND nullif(current_setting('app.example_session',true),'') IS NULL
 AND rowlens_club_active() AND EXISTS(SELECT 1 FROM membership m
 WHERE m.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND m.user_id=rowlens_user_id())
 AND EXISTS(SELECT 1 FROM session_share s WHERE s.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND s.session_id=p_session AND (s.scope='club' OR s.recipient_user_id=rowlens_user_id()))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_can_manage_session_sharing(p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_user_id() IS NOT NULL AND rowlens_club_active()
 AND nullif(current_setting('app.example_session',true),'') IS NULL
 AND rowlens_video_actor_current() AND rowlens_can_edit_session(p_session)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_session_sharing(p_session uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('revision',s.sharing_revision,'isExample',s.is_example,
 'clubWide',EXISTS(SELECT 1 FROM session_share g WHERE g.club_id=s.club_id AND g.session_id=s.id AND g.scope='club'),
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),'')) ORDER BY u.first_name,u.last_name,u.id)
 FROM session_share g JOIN app_user u ON u.id=g.recipient_user_id
 WHERE g.club_id=s.club_id AND g.session_id=s.id AND g.scope='member'),'[]'::jsonb))
 FROM rowing_session s WHERE s.id=p_session AND s.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND rowlens_can_manage_session_sharing(s.id)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_session_share_members(p_session uuid,p_query text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN rowlens_can_manage_session_sharing(p_session) AND char_length(btrim(p_query)) BETWEEN 2 AND 80 THEN
 (SELECT jsonb_build_object('members',coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name) ORDER BY a.name,a.id) FILTER(WHERE a.n<=20),'[]'::jsonb),'more',count(*)>20)
 FROM (SELECT u.id,nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),'') AS name,
 row_number() OVER(ORDER BY u.first_name,u.last_name,u.id) AS n
 FROM membership m JOIN app_user u ON u.id=m.user_id
 WHERE m.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND position(lower(btrim(p_query)) IN lower(concat_ws(' ',u.first_name,u.last_name)))>0
 ORDER BY u.first_name,u.last_name,u.id LIMIT 21) a) END
$$;
--> statement-breakpoint
-- Trigger records only actual changes, including cascaded membership removal; UUIDs retain history.
CREATE FUNCTION rowlens_audit_session_share() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g session_share%ROWTYPE;
BEGIN
 IF TG_OP='INSERT' THEN g:=NEW; ELSE g:=OLD; END IF;
 INSERT INTO session_share_event(club_id,session_id,actor_user_id,scope,recipient_user_id,action)
 VALUES(g.club_id,g.session_id,rowlens_user_id(),g.scope,g.recipient_user_id,CASE WHEN TG_OP='INSERT' THEN 'grant' ELSE 'revoke' END);
 UPDATE rowing_session SET sharing_revision=sharing_revision+1 WHERE club_id=g.club_id AND id=g.session_id;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_session_share AFTER INSERT OR DELETE ON session_share FOR EACH ROW EXECUTE FUNCTION rowlens_audit_session_share();
--> statement-breakpoint
CREATE FUNCTION rowlens_set_session_sharing(p_session uuid,p_club_wide boolean,p_users jsonb,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid;
 ids uuid[]; rev integer;
BEGIN
 IF NOT rowlens_can_manage_session_sharing(p_session) THEN RETURN NULL; END IF;
 IF p_club_wide IS NULL OR p_users IS NULL OR jsonb_typeof(p_users)<>'array' THEN RETURN jsonb_build_object('error','invalid_recipients'); END IF;
 IF jsonb_array_length(p_users)>500 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_users) e
 WHERE jsonb_typeof(e)<>'string' OR (e#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
 THEN RETURN jsonb_build_object('error','invalid_recipients'); END IF;
 SELECT coalesce(array_agg(v::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements_text(p_users) v;
 IF cardinality(ids)<>(SELECT count(DISTINCT v) FROM unnest(ids) v) THEN RETURN jsonb_build_object('error','invalid_recipients'); END IF;
 -- Match club-access changes, lock actor/recipient identities and live authority before the parent.
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||cid::text,0));
 PERFORM 1 FROM app_user WHERE id=rowlens_user_id() FOR KEY SHARE;
 PERFORM 1 FROM membership WHERE club_id=cid AND (user_id=ANY(ids) OR user_id=rowlens_user_id()) ORDER BY user_id FOR SHARE;
 PERFORM 1 FROM platform_admin WHERE user_id=rowlens_user_id() FOR SHARE;
 IF NOT rowlens_can_manage_session_sharing(p_session) THEN RETURN NULL; END IF;
 SELECT sharing_revision INTO rev FROM rowing_session WHERE id=p_session AND club_id=cid FOR UPDATE;
 IF NOT FOUND OR NOT rowlens_can_manage_session_sharing(p_session) THEN RETURN NULL; END IF;
 IF p_revision IS NULL OR rev<>p_revision THEN RETURN jsonb_build_object('error','conflict'); END IF;
 IF cardinality(ids)<>(SELECT count(*) FROM membership WHERE club_id=cid AND user_id=ANY(ids)) THEN RETURN jsonb_build_object('error','invalid_recipients'); END IF;
 DELETE FROM session_share WHERE club_id=cid AND session_id=p_session
 AND ((scope='club' AND NOT p_club_wide) OR (scope='member' AND NOT recipient_user_id=ANY(ids)));
 IF p_club_wide THEN INSERT INTO session_share(club_id,session_id,scope,shared_by_user_id)
 VALUES(cid,p_session,'club',rowlens_user_id()) ON CONFLICT DO NOTHING; END IF;
 INSERT INTO session_share(club_id,session_id,scope,recipient_user_id,shared_by_user_id)
 SELECT cid,p_session,'member',v,rowlens_user_id() FROM unnest(ids) v ON CONFLICT DO NOTHING;
 RETURN rowlens_session_sharing(p_session);
END $$;
--> statement-breakpoint
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('rowlens_session_shared','rowlens_can_manage_session_sharing','rowlens_session_sharing','rowlens_session_share_members','rowlens_set_session_sharing') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO rowlens_app',f.sig);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION rowlens_audit_session_share() FROM PUBLIC;
REVOKE UPDATE,DELETE ON session_share_event FROM rowlens_app;
--> statement-breakpoint
CREATE POLICY "session_share_tenant" ON "session_share" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("session_share"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("session_share"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
CREATE POLICY "session_share_example_read" ON "session_share" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "session_share_example_add" ON "session_share" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "session_share_example_edit" ON "session_share" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "session_share_example_delete" ON "session_share" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "session_share_role_read" ON "session_share" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_manage_session_sharing("session_share"."session_id"));--> statement-breakpoint
CREATE POLICY "session_share_role_add" ON "session_share" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "session_share_role_edit" ON "session_share" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "session_share_role_delete" ON "session_share" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (false);--> statement-breakpoint
CREATE POLICY "session_share_event_tenant" ON "session_share_event" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("session_share_event"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("session_share_event"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
CREATE POLICY "session_share_event_example_read" ON "session_share_event" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null or false);--> statement-breakpoint
CREATE POLICY "session_share_event_example_add" ON "session_share_event" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "session_share_event_example_edit" ON "session_share_event" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null) WITH CHECK (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "session_share_event_example_delete" ON "session_share_event" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (nullif(current_setting('app.example_session', true), '') is null);--> statement-breakpoint
CREATE POLICY "session_share_event_role_read" ON "session_share_event" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_admin_member() or rowlens_can_manage_session_sharing("session_share_event"."session_id"));--> statement-breakpoint
CREATE POLICY "session_share_event_role_add" ON "session_share_event" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "session_share_event_role_edit" ON "session_share_event" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "session_share_event_role_delete" ON "session_share_event" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (false);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_can_read_training_row(p_session uuid,p_creator uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN nullif(current_setting('app.example_session',true),'') IS NOT NULL
 THEN rowlens_example_session(p_session)
 ELSE rowlens_can_read_trainings() AND (rowlens_roster_manager() OR p_creator=rowlens_user_id()
 OR rowlens_session_shared(p_session) OR EXISTS(SELECT 1 FROM lineup_seat ls JOIN rower r ON r.id=ls.rower_id AND r.club_id=ls.club_id
 WHERE ls.session_id=p_session AND ls.club_id=nullif(current_setting('app.club_id',true),'')::uuid
 AND (r.user_id=rowlens_user_id() OR ls.account_user_id=rowlens_user_id())))
 AND (current_setting('app.training_permissions',true)='owner-or-staff' OR rowlens_sees_all()
 OR p_creator=rowlens_user_id() OR rowlens_session_reachable(p_session)) END
$$;

