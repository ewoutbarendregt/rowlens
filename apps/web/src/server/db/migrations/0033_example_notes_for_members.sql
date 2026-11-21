-- BUG-074: the publishing RowLens admin's notes and drawings on a published example are visible
-- to everyone who can see the video, also in the ordinary training pages of the owning club.
-- Every verified account already reads exactly these annotations through the example API
-- (ADR-0030); nothing else about who sees which training, video or note changes.
CREATE FUNCTION rowlens_published_example_annotation(p_video uuid,p_author uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_author IS NOT NULL AND EXISTS(
  SELECT 1 FROM video v
  JOIN rowing_session s ON s.id=v.session_id AND s.club_id=v.club_id
  JOIN club c ON c.id=s.club_id
  WHERE v.id=p_video AND v.club_id=nullif(current_setting('app.club_id',true),'')::uuid
  AND s.is_example AND c.archived_at IS NULL AND s.example_publisher_user_id=p_author)
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_published_example_annotation(uuid,uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_published_example_annotation(uuid,uuid) TO rowlens_app;
--> statement-breakpoint
-- Same expression as 0031 set by hand; restated so the Drizzle snapshot matches the database.
ALTER POLICY "annotation_example_read" ON "annotation" TO rowlens_app USING (nullif(current_setting('app.example_session', true), '') is null or rowlens_example_annotation("annotation"."video_id", "annotation"."author_user_id"));--> statement-breakpoint
-- Ordinary reads: unchanged, plus the publisher's annotations of a published example. Seeing the
-- video itself (rowlens_can_see_video) is still required.
ALTER POLICY "annotation_role_read" ON "annotation" TO rowlens_app USING (case when nullif(current_setting('app.example_session', true), '') is not null then rowlens_example_annotation("annotation"."video_id", "annotation"."author_user_id") else rowlens_can_see_video("annotation"."video_id") and (rowlens_can_see_moment("annotation"."video_id", "annotation"."frame") or "annotation"."author_user_id" = rowlens_user_id() or rowlens_published_example_annotation("annotation"."video_id", "annotation"."author_user_id")) end);
