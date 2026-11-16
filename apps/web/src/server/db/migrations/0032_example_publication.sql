-- Explicit promotion is global-admin-only, tenant-bound and tied to the verified current actor.
CREATE FUNCTION rowlens_example_manager() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT nullif(current_setting('app.example_session',true),'') IS NULL
 AND rowlens_club_active() AND rowlens_platform_admin()
 AND EXISTS(SELECT 1 FROM app_user WHERE id=rowlens_user_id() AND verified_at IS NOT NULL)
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_stamp_example() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.is_example:=rowlens_platform_admin() AND NEW.created_by_user_id=rowlens_user_id();
  NEW.example_publisher_user_id:=CASE WHEN NEW.is_example THEN rowlens_user_id() ELSE NULL END;
 ELSIF NOT OLD.is_example AND NEW.is_example
  AND current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.rowing_session'::regclass)
  AND current_setting('app.publish_example',true)=NEW.id::text
  AND NEW.club_id=nullif(current_setting('app.club_id',true),'')::uuid
  AND rowlens_example_manager() THEN
  NEW.example_publisher_user_id:=rowlens_user_id();
 ELSE
  NEW.is_example:=OLD.is_example;
  NEW.example_publisher_user_id:=OLD.example_publisher_user_id;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_publish_example(p_session uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid:=nullif(current_setting('app.club_id',true),'')::uuid;
 published boolean; previous_marker text:=current_setting('app.publish_example',true);
BEGIN
 IF NOT rowlens_example_manager() THEN RETURN NULL; END IF;
 -- Share the established club-access lock ordering. Hold live identity/grant/club authority
 -- through the parent update; a revocation/archive already in progress wins before publication.
 PERFORM pg_advisory_xact_lock(hashtextextended('rowlens-access:'||cid::text,0));
 PERFORM 1 FROM app_user WHERE id=rowlens_user_id() AND verified_at IS NOT NULL FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM platform_admin WHERE user_id=rowlens_user_id() FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM 1 FROM club WHERE id=cid AND archived_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT is_example INTO published FROM rowing_session WHERE id=p_session AND club_id=cid FOR UPDATE;
 IF NOT FOUND OR NOT rowlens_example_manager() THEN RETURN NULL; END IF;
 IF published THEN RETURN jsonb_build_object('id',p_session,'status','already-published'); END IF;
 PERFORM set_config('app.publish_example',p_session::text,true);
 UPDATE rowing_session SET is_example=true WHERE id=p_session AND club_id=cid;
 PERFORM set_config('app.publish_example',coalesce(previous_marker,''),true);
 PERFORM rowlens_audit_platform('publish_example',cid::text||':'||p_session::text);
 RETURN jsonb_build_object('id',p_session,'status','published');
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_example_manager() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rowlens_example_manager() TO rowlens_app;
REVOKE ALL ON FUNCTION rowlens_publish_example(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rowlens_publish_example(uuid) TO rowlens_app;
