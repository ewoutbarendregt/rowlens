ALTER TABLE "rowing_session" ADD COLUMN "example_publisher_user_id" uuid;--> statement-breakpoint
ALTER TABLE "rowing_session" ADD CONSTRAINT "rowing_session_example_publisher_user_id_app_user_id_fk" FOREIGN KEY ("example_publisher_user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Publisher attribution is fixed at publication, not at the current mutable creator.
-- Backfill only unambiguous, still-persisted platform creators; unknown authors remain private.
DROP TRIGGER stamp_example ON rowing_session;
--> statement-breakpoint
UPDATE rowing_session SET example_publisher_user_id=created_by_user_id
WHERE is_example AND created_by_user_id IN (SELECT user_id FROM platform_admin);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_stamp_example() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.is_example:=rowlens_platform_admin() AND NEW.created_by_user_id=rowlens_user_id();
  NEW.example_publisher_user_id:=CASE WHEN NEW.is_example THEN rowlens_user_id() ELSE NULL END;
 ELSE
  NEW.is_example:=OLD.is_example;
  NEW.example_publisher_user_id:=OLD.example_publisher_user_id;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER stamp_example BEFORE INSERT OR UPDATE ON rowing_session FOR EACH ROW EXECUTE FUNCTION rowlens_stamp_example();
--> statement-breakpoint
CREATE FUNCTION rowlens_example_annotation(p_video uuid,p_author uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT rowlens_example_video(p_video) AND EXISTS(
  SELECT 1 FROM video v JOIN rowing_session s ON s.id=v.session_id AND s.club_id=v.club_id
  WHERE v.id=p_video AND s.example_publisher_user_id=p_author)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_example_annotation(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rowlens_example_annotation(uuid,uuid) TO rowlens_app;
--> statement-breakpoint
ALTER POLICY annotation_example_read ON annotation USING (
 nullif(current_setting('app.example_session',true),'') IS NULL OR rowlens_example_annotation(video_id,author_user_id));
--> statement-breakpoint
ALTER POLICY "annotation_role_read" ON "annotation" TO rowlens_app USING (case when nullif(current_setting('app.example_session', true), '') is not null then rowlens_example_annotation("annotation"."video_id", "annotation"."author_user_id") else rowlens_can_see_video("annotation"."video_id") and (rowlens_can_see_moment("annotation"."video_id", "annotation"."frame") or "annotation"."author_user_id" = rowlens_user_id()) end);
