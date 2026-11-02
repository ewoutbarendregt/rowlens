-- Coaches see their own sessions too (#108, ADR-0013 addendum): only the admin (and the worker and
-- pilot path, which have no role) sees the whole club. A coach sees what a rower would (created, in
-- the lineup, a note for them) and, within those sessions, every note, which they may also change.
CREATE OR REPLACE FUNCTION rowlens_sees_all() RETURNS boolean
	LANGUAGE sql STABLE SET search_path = public, pg_temp
	AS $$ SELECT coalesce(nullif(current_setting('app.role', true), ''), 'admin') = 'admin' $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_coaches_video(p_video uuid) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT current_setting('app.role', true) = 'coach' AND EXISTS (
			SELECT 1 FROM video AS v WHERE v.id = p_video AND rowlens_can_see_session(v.session_id)
		)
	$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION rowlens_can_see_moment(p_video uuid, p_frame integer) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT rowlens_sees_all()
			OR rowlens_coaches_video(p_video)
			OR EXISTS (SELECT 1 FROM annotation AS a
				WHERE a.video_id = p_video AND a.frame = p_frame
					AND a.author_user_id = rowlens_user_id())
			OR EXISTS (
				SELECT 1 FROM moment AS m
				WHERE m.video_id = p_video AND m.frame = p_frame AND (
					EXISTS (SELECT 1 FROM moment_rower AS mr
						WHERE mr.moment_id = m.id AND mr.rower_id IN (SELECT rowlens_my_rowers()))
					OR EXISTS (SELECT 1 FROM moment_share AS s
						WHERE s.moment_id = m.id AND s.scope = 'rower'
							AND s.rower_id IN (SELECT rowlens_my_rowers()))
					OR EXISTS (SELECT 1 FROM moment_share AS s
						JOIN video AS v ON v.id = m.video_id
						JOIN lineup_seat AS ls ON ls.session_id = v.session_id
						WHERE s.moment_id = m.id AND s.scope = 'crew'
							AND ls.rower_id IN (SELECT rowlens_my_rowers()))
				)
			)
	$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_coaches_video(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_coaches_video(uuid) TO rowlens_app;
--> statement-breakpoint
ALTER POLICY "annotation_role_edit" ON "annotation" TO rowlens_app USING (rowlens_sees_all() or "annotation"."author_user_id" = rowlens_user_id() or rowlens_coaches_video("annotation"."video_id")) WITH CHECK (rowlens_sees_all() or "annotation"."author_user_id" = rowlens_user_id() or rowlens_coaches_video("annotation"."video_id"));--> statement-breakpoint
ALTER POLICY "annotation_role_delete" ON "annotation" TO rowlens_app USING (rowlens_sees_all() or "annotation"."author_user_id" = rowlens_user_id() or rowlens_coaches_video("annotation"."video_id"));