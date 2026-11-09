ALTER TABLE "annotation" ADD CONSTRAINT "annotation_club_id_id_unique" UNIQUE("club_id","id");--> statement-breakpoint
CREATE TABLE "video_annotation_reference" (
	"club_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"annotation_id" uuid NOT NULL,
	"added_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_annotation_reference_video_id_annotation_id_pk" PRIMARY KEY("video_id","annotation_id")
);
--> statement-breakpoint
ALTER TABLE "video_annotation_reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "video_asset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"club_id" uuid NOT NULL,
	"metadata" jsonb NOT NULL,
	"size_bytes" bigint NOT NULL,
	"renditions_bytes" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "video_asset_club_id_id_unique" UNIQUE("club_id","id")
);
--> statement-breakpoint
ALTER TABLE "video_asset" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "asset_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "video_annotation_reference" ADD CONSTRAINT "video_annotation_reference_video_fk" FOREIGN KEY ("club_id","video_id") REFERENCES "public"."video"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_annotation_reference" ADD CONSTRAINT "video_annotation_reference_annotation_fk" FOREIGN KEY ("club_id","annotation_id") REFERENCES "public"."annotation"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_asset" ADD CONSTRAINT "video_asset_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE video SET asset_id=id;
--> statement-breakpoint
INSERT INTO video_asset(id,club_id,metadata,size_bytes,renditions_bytes)
SELECT id,club_id,to_jsonb(v) - ARRAY['id','club_id','session_id','asset_id','seq','perspective','created_at','updated_at'],size_bytes,renditions_bytes FROM video v;
--> statement-breakpoint
ALTER TABLE "video" ADD CONSTRAINT "video_asset_fk" FOREIGN KEY ("club_id","asset_id") REFERENCES "public"."video_asset"("club_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_asset_idx" ON "video" USING btree ("asset_id");--> statement-breakpoint
CREATE FUNCTION rowlens_video_actor_current() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_service() OR rowlens_platform_admin() OR EXISTS(
  SELECT 1 FROM membership m WHERE m.club_id=nullif(current_setting('app.club_id',true),'')::uuid
  AND m.user_id=rowlens_user_id() AND m.roles @> ARRAY(
   SELECT jsonb_array_elements_text(coalesce(nullif(current_setting('app.roles',true),''),'[]')::jsonb)
  ) AND coalesce(jsonb_array_length(nullif(current_setting('app.roles',true),'')::jsonb),0)>0
 )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_video_actor_current() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_video_actor_current() TO rowlens_app;
--> statement-breakpoint
CREATE FUNCTION rowlens_can_reference_annotation(p_target uuid,p_annotation uuid,p_write boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(rowlens_video_actor_current() AND rowlens_club_active() AND EXISTS(
  SELECT 1 FROM video t JOIN video s ON s.asset_id=t.asset_id AND s.club_id=t.club_id
  JOIN annotation a ON a.video_id=s.id AND a.club_id=s.club_id
  WHERE t.id=p_target AND a.id=p_annotation AND t.id<>s.id
  AND t.club_id=nullif(current_setting('app.club_id',true),'')::uuid
  AND rowlens_can_see_video(t.id) AND rowlens_can_see_video(s.id)
  AND (NOT p_write OR rowlens_can_edit_video(t.id))
  AND (rowlens_can_see_moment(a.video_id,a.frame) OR a.author_user_id=rowlens_user_id())
 ),false)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_can_reference_annotation(uuid,uuid,boolean) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_can_reference_annotation(uuid,uuid,boolean) TO rowlens_app;
--> statement-breakpoint
CREATE POLICY "video_annotation_reference_tenant" ON "video_annotation_reference" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("video_annotation_reference"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("video_annotation_reference"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
CREATE POLICY "video_annotation_reference_read" ON "video_annotation_reference" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_reference_annotation("video_annotation_reference"."video_id", "video_annotation_reference"."annotation_id", false));--> statement-breakpoint
CREATE POLICY "video_annotation_reference_add" ON "video_annotation_reference" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_can_reference_annotation("video_annotation_reference"."video_id", "video_annotation_reference"."annotation_id", true) and "video_annotation_reference"."added_by_user_id" is not distinct from rowlens_user_id());--> statement-breakpoint
CREATE POLICY "video_annotation_reference_edit" ON "video_annotation_reference" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (false) WITH CHECK (false);--> statement-breakpoint
CREATE POLICY "video_annotation_reference_delete" ON "video_annotation_reference" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_can_edit_video("video_annotation_reference"."video_id"));--> statement-breakpoint
CREATE POLICY "video_asset_tenant" ON "video_asset" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("video_asset"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active()) WITH CHECK ("video_asset"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid and rowlens_club_active());--> statement-breakpoint
CREATE POLICY "video_asset_role" ON "video_asset" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (false) WITH CHECK (false);
--> statement-breakpoint
-- Trigger-only physical metadata projection: old upload/worker images keep working unchanged.
CREATE FUNCTION rowlens_video_asset_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a video_asset; physical jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  PERFORM 1 FROM video_asset WHERE id=OLD.asset_id AND club_id=OLD.club_id FOR UPDATE;
  IF coalesce(current_setting('app.video_assets',true),'')<>'isolated'
   AND (OLD.asset_id<>OLD.id OR EXISTS(SELECT 1 FROM video WHERE asset_id=OLD.asset_id AND id<>OLD.id))
  THEN RAISE EXCEPTION 'shared_video_requires_asset_aware_server' USING ERRCODE='42501'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.asset_id<>OLD.asset_id OR NEW.club_id<>OLD.club_id OR NEW.id<>OLD.id)
 THEN RAISE EXCEPTION 'immutable_video_asset' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM video_asset WHERE id=NEW.asset_id AND club_id=NEW.club_id FOR UPDATE;
 IF TG_OP='INSERT' AND FOUND THEN
  IF coalesce(current_setting('app.video_assets',true),'')<>'isolated'
   OR NOT rowlens_video_actor_current() OR a.metadata->>'status'<>'ready' OR NOT rowlens_club_active()
   OR NOT EXISTS(SELECT 1 FROM video s WHERE s.asset_id=a.id AND s.club_id=NEW.club_id AND rowlens_can_see_video(s.id))
  THEN RAISE EXCEPTION 'unreadable_video_asset' USING ERRCODE='42501'; END IF;
  -- Fill only physical fields, never entry identity, permissions, sequence or perspective.
  NEW := jsonb_populate_record(NEW,a.metadata);
 ELSE
  IF TG_OP='INSERT' THEN NEW.asset_id:=NEW.id; END IF;
  physical:=to_jsonb(NEW) - ARRAY['id','club_id','session_id','asset_id','seq','perspective','created_at','updated_at'];
  IF TG_OP='UPDATE' AND NEW.asset_id<>NEW.id THEN
   IF physical IS DISTINCT FROM a.metadata THEN RAISE EXCEPTION 'immutable_shared_metadata' USING ERRCODE='42501'; END IF;
  ELSE
   IF TG_OP='UPDATE' AND physical IS DISTINCT FROM a.metadata
    AND EXISTS(SELECT 1 FROM video WHERE asset_id=NEW.asset_id AND id<>NEW.id)
   THEN RAISE EXCEPTION 'immutable_shared_metadata' USING ERRCODE='42501'; END IF;
   INSERT INTO video_asset(id,club_id,metadata,size_bytes,renditions_bytes)
    VALUES(NEW.asset_id,NEW.club_id,physical,NEW.size_bytes,NEW.renditions_bytes)
    ON CONFLICT(id) DO UPDATE SET metadata=EXCLUDED.metadata,size_bytes=EXCLUDED.size_bytes,renditions_bytes=EXCLUDED.renditions_bytes;
  END IF;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_video_asset_sync() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER video_asset_sync BEFORE INSERT OR UPDATE OR DELETE ON video
FOR EACH ROW EXECUTE FUNCTION rowlens_video_asset_sync();
--> statement-breakpoint
CREATE FUNCTION rowlens_collect_unused_assets(p_assets uuid[]) RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE asset uuid;
BEGIN
 IF NOT rowlens_can_read_trainings() OR NOT rowlens_club_active()
  OR current_setting('app.video_assets',true) IS DISTINCT FROM 'isolated' THEN RETURN; END IF;
 FOR asset IN SELECT id FROM video_asset WHERE id=ANY(p_assets)
  AND club_id=nullif(current_setting('app.club_id',true),'')::uuid ORDER BY id FOR UPDATE
 LOOP
  DELETE FROM video_asset a WHERE a.id=asset AND NOT EXISTS(SELECT 1 FROM video v WHERE v.asset_id=a.id);
  IF FOUND THEN RETURN NEXT asset; END IF;
 END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_collect_unused_assets(uuid[]) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_collect_unused_assets(uuid[]) TO rowlens_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_media_bytes() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(sum(size_bytes+renditions_bytes),0)::bigint FROM video_asset WHERE metadata->>'status'<>'rejected'
$$;

--> statement-breakpoint
CREATE FUNCTION rowlens_lock_video_asset(p_asset uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF rowlens_club_active() AND EXISTS(SELECT 1 FROM video v WHERE v.asset_id=p_asset
  AND v.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_can_see_video(v.id))
 THEN PERFORM 1 FROM video_asset WHERE id=p_asset AND club_id=nullif(current_setting('app.club_id',true),'')::uuid FOR UPDATE; END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_lock_video_asset(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_lock_video_asset(uuid) TO rowlens_app;
--> statement-breakpoint
-- Old-image ordinary deletion still reclaims its single asset and bytes. Shared deletions refuse
-- in the BEFORE trigger, before the old server can remove anyone else's physical directory.
CREATE FUNCTION rowlens_legacy_asset_cleanup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(current_setting('app.video_assets',true),'')<>'isolated' THEN
  DELETE FROM video_asset a WHERE a.id=OLD.asset_id AND a.club_id=OLD.club_id
   AND NOT EXISTS(SELECT 1 FROM video v WHERE v.asset_id=a.id);
 END IF;
 RETURN NULL;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_legacy_asset_cleanup() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER video_legacy_asset_cleanup AFTER DELETE ON video
FOR EACH ROW EXECUTE FUNCTION rowlens_legacy_asset_cleanup();
