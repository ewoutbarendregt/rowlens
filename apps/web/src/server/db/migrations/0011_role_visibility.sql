CREATE TYPE "public"."moment_share_scope" AS ENUM('rower', 'crew');--> statement-breakpoint
ALTER TYPE "public"."moment_rower_action" ADD VALUE 'shared';--> statement-breakpoint
ALTER TYPE "public"."moment_rower_action" ADD VALUE 'unshared';--> statement-breakpoint
CREATE TABLE "moment_share" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"moment_id" uuid NOT NULL,
	"scope" "moment_share_scope" NOT NULL,
	"rower_id" uuid,
	"shared_by_user_id" uuid,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moment_share_rower_unique" UNIQUE("moment_id","rower_id"),
	CONSTRAINT "moment_share_scope_check" CHECK (("moment_share"."scope" = 'rower') = ("moment_share"."rower_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "moment_share" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "moment_rower_log" ALTER COLUMN "rower_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "annotation" ADD COLUMN "author_user_id" uuid;--> statement-breakpoint
ALTER TABLE "rowing_session" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "moment_share" ADD CONSTRAINT "moment_share_moment_fk" FOREIGN KEY ("club_id","moment_id") REFERENCES "public"."moment"("club_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_share" ADD CONSTRAINT "moment_share_rower_fk" FOREIGN KEY ("club_id","rower_id") REFERENCES "public"."rower"("club_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moment_share_crew_unique" ON "moment_share" USING btree ("moment_id") WHERE "moment_share"."scope" = 'crew';--> statement-breakpoint
CREATE INDEX "moment_share_rower_idx" ON "moment_share" USING btree ("rower_id");--> statement-breakpoint
-- Role visibility (#40, ADR-0013). withTenant sets app.role; empty means the worker or the
-- pilot-code path, which see the whole club as before. Coaches and admins see everything; a rower
-- sees the sessions they rowed in or created (or where a note is meant for them), and the notes
-- meant for them, shared with them, or written by them. The definer functions read past RLS, so the
-- policies below can call them without recursing; each is pinned to search_path.
CREATE FUNCTION rowlens_user_id() RETURNS uuid
	LANGUAGE sql STABLE SET search_path = public, pg_temp
	AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_sees_all() RETURNS boolean
	LANGUAGE sql STABLE SET search_path = public, pg_temp
	AS $$ SELECT coalesce(nullif(current_setting('app.role', true), ''), 'coach') <> 'rower' $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_my_rowers() RETURNS SETOF uuid
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT r.id FROM rower AS r
		WHERE r.user_id = rowlens_user_id()
			AND r.club_id = nullif(current_setting('app.club_id', true), '')::uuid
	$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_session_reachable(p_session uuid) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT EXISTS (
			SELECT 1 FROM lineup_seat AS ls
			WHERE ls.session_id = p_session AND ls.rower_id IN (SELECT rowlens_my_rowers())
		) OR EXISTS (
			SELECT 1 FROM moment AS m JOIN video AS v ON v.id = m.video_id
			WHERE v.session_id = p_session AND (
				EXISTS (SELECT 1 FROM moment_rower AS mr
					WHERE mr.moment_id = m.id AND mr.rower_id IN (SELECT rowlens_my_rowers()))
				OR EXISTS (SELECT 1 FROM moment_share AS s
					WHERE s.moment_id = m.id AND s.scope = 'rower'
						AND s.rower_id IN (SELECT rowlens_my_rowers()))
			)
		)
	$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_can_see_session(p_session uuid) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT rowlens_sees_all()
			OR EXISTS (SELECT 1 FROM rowing_session AS s
				WHERE s.id = p_session AND s.created_by_user_id = rowlens_user_id())
			OR rowlens_session_reachable(p_session)
	$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_can_see_video(p_video uuid) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT rowlens_sees_all() OR EXISTS (
			SELECT 1 FROM video AS v WHERE v.id = p_video AND rowlens_can_see_session(v.session_id)
		)
	$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_can_see_moment(p_video uuid, p_frame integer) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT rowlens_sees_all()
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
CREATE FUNCTION rowlens_can_see_moment_id(p_moment uuid) RETURNS boolean
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT rowlens_sees_all() OR EXISTS (
			SELECT 1 FROM moment AS m
			WHERE m.id = p_moment AND rowlens_can_see_moment(m.video_id, m.frame)
		)
	$$;
--> statement-breakpoint
CREATE POLICY "annotation_role_read" ON "annotation" AS RESTRICTIVE FOR SELECT TO "rowlens_app" USING (rowlens_can_see_moment("annotation"."video_id", "annotation"."frame") or "annotation"."author_user_id" = rowlens_user_id());--> statement-breakpoint
CREATE POLICY "annotation_role_add" ON "annotation" AS RESTRICTIVE FOR INSERT TO "rowlens_app" WITH CHECK (rowlens_sees_all() or ("annotation"."author_user_id" = rowlens_user_id() and rowlens_can_see_video("annotation"."video_id")));--> statement-breakpoint
CREATE POLICY "annotation_role_edit" ON "annotation" AS RESTRICTIVE FOR UPDATE TO "rowlens_app" USING (rowlens_sees_all() or "annotation"."author_user_id" = rowlens_user_id()) WITH CHECK (rowlens_sees_all() or "annotation"."author_user_id" = rowlens_user_id());--> statement-breakpoint
CREATE POLICY "annotation_role_delete" ON "annotation" AS RESTRICTIVE FOR DELETE TO "rowlens_app" USING (rowlens_sees_all() or "annotation"."author_user_id" = rowlens_user_id());--> statement-breakpoint
CREATE POLICY "lineup_seat_role" ON "lineup_seat" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_can_see_session("lineup_seat"."session_id")) WITH CHECK (rowlens_can_see_session("lineup_seat"."session_id"));--> statement-breakpoint
CREATE POLICY "moment_role" ON "moment" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_can_see_moment("moment"."video_id", "moment"."frame")) WITH CHECK (rowlens_can_see_moment("moment"."video_id", "moment"."frame"));--> statement-breakpoint
CREATE POLICY "moment_rower_role" ON "moment_rower" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_can_see_moment_id("moment_rower"."moment_id")) WITH CHECK (rowlens_can_see_moment_id("moment_rower"."moment_id"));--> statement-breakpoint
CREATE POLICY "moment_rower_log_role" ON "moment_rower_log" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_can_see_moment_id("moment_rower_log"."moment_id")) WITH CHECK (rowlens_can_see_moment_id("moment_rower_log"."moment_id"));--> statement-breakpoint
CREATE POLICY "rowing_session_role" ON "rowing_session" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_sees_all() or "rowing_session"."created_by_user_id" = rowlens_user_id() or rowlens_session_reachable("rowing_session"."id")) WITH CHECK (rowlens_sees_all() or "rowing_session"."created_by_user_id" = rowlens_user_id() or rowlens_session_reachable("rowing_session"."id"));--> statement-breakpoint
CREATE POLICY "video_role" ON "video" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_can_see_session("video"."session_id")) WITH CHECK (rowlens_can_see_session("video"."session_id"));--> statement-breakpoint
CREATE POLICY "moment_share_tenant" ON "moment_share" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("moment_share"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("moment_share"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "moment_share_role" ON "moment_share" AS RESTRICTIVE FOR ALL TO "rowlens_app" USING (rowlens_can_see_moment_id("moment_share"."moment_id")) WITH CHECK (rowlens_can_see_moment_id("moment_share"."moment_id"));
--> statement-breakpoint
-- Linking an account to the roster (#40, the exact-e-mail part of #110): on login, the roster entry
-- a coach gave exactly this e-mail address becomes this account's, if it has none yet.
CREATE OR REPLACE FUNCTION rowlens_auth_ensure_user(
	p_email text,
	p_display_name text,
	p_locale text,
	p_club_slug text,
	p_role text
) RETURNS TABLE(user_id uuid, club_id uuid, email text, display_name text, locale text)
	LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
#variable_conflict use_column
DECLARE
	v_user_id uuid;
	v_club_id uuid;
BEGIN
	IF p_role NOT IN ('rower', 'coach', 'admin') THEN
		RETURN;
	END IF;
	SELECT c.id INTO v_club_id FROM club AS c WHERE c.slug = p_club_slug;
	IF v_club_id IS NULL THEN
		RETURN;
	END IF;

	INSERT INTO app_user AS u (email, display_name, locale)
	VALUES (p_email, p_display_name, CASE WHEN p_locale = 'en' THEN 'en' ELSE 'nl' END)
	ON CONFLICT ON CONSTRAINT app_user_email_unique DO UPDATE SET email = excluded.email
	RETURNING u.id INTO v_user_id;

	INSERT INTO membership AS m (club_id, user_id, role)
	VALUES (v_club_id, v_user_id, p_role)
	ON CONFLICT (club_id, user_id) DO UPDATE SET role = excluded.role;

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
REVOKE ALL ON FUNCTION rowlens_my_rowers(), rowlens_session_reachable(uuid), rowlens_can_see_session(uuid),
	rowlens_can_see_video(uuid), rowlens_can_see_moment(uuid, integer), rowlens_can_see_moment_id(uuid)
	FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_user_id(), rowlens_sees_all(), rowlens_my_rowers(),
	rowlens_session_reachable(uuid), rowlens_can_see_session(uuid), rowlens_can_see_video(uuid),
	rowlens_can_see_moment(uuid, integer), rowlens_can_see_moment_id(uuid)
	TO rowlens_app;
