CREATE TYPE "public"."club_access_action" AS ENUM('added', 'role_changed', 'removed');--> statement-breakpoint
CREATE TABLE "club_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"added_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_access_club_email_unique" UNIQUE("club_id","email"),
	CONSTRAINT "club_access_role_check" CHECK ("club_access"."role" in ('rower', 'coach', 'admin')),
	CONSTRAINT "club_access_email_check" CHECK ("club_access"."email" = lower("club_access"."email") and "club_access"."email" like '%_@_%')
);
--> statement-breakpoint
ALTER TABLE "club_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "club_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"email" text NOT NULL,
	"action" "club_access_action" NOT NULL,
	"role" text,
	"by_user_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_access_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "membership" DROP CONSTRAINT "membership_role_check";--> statement-breakpoint
ALTER TABLE "club_access" ADD CONSTRAINT "club_access_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_access_log" ADD CONSTRAINT "club_access_log_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_access_log_club_at_idx" ON "club_access_log" USING btree ("club_id","at");--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_role_check" CHECK ("membership"."role" in ('rower', 'coach', 'admin'));--> statement-breakpoint
CREATE POLICY "club_access_tenant" ON "club_access" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("club_access"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("club_access"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "club_access_log_tenant" ON "club_access_log" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("club_access_log"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("club_access_log"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint

-- Who may log in, and as what, from the in-app access list (#42). The login step has no club
-- context yet, so this reads past RLS for exactly one (club, e-mail) pair.
CREATE FUNCTION rowlens_auth_access(p_email text, p_club_slug text) RETURNS text
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT a.role
		FROM club_access AS a
		JOIN club AS c ON c.id = a.club_id
		WHERE c.slug = p_club_slug AND a.email = p_email
	$$;
--> statement-breakpoint

-- Provisioning now takes the role the access list (or the server settings) gives, and keeps the
-- membership in step with it on every code request.
DROP FUNCTION rowlens_auth_ensure_user(text, text, text, text);
--> statement-breakpoint
CREATE FUNCTION rowlens_auth_ensure_user(
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

	RETURN QUERY
	SELECT u.id, m.club_id, u.email, u.display_name, u.locale
	FROM app_user AS u
	JOIN membership AS m ON m.user_id = u.id
	WHERE u.id = v_user_id AND m.club_id = v_club_id;
END;
$$;
--> statement-breakpoint

-- The session now also says which role its membership has, so admin pages can be checked.
DROP FUNCTION rowlens_auth_session(text);
--> statement-breakpoint
CREATE FUNCTION rowlens_auth_session(p_token_hash text)
RETURNS TABLE(
	session_id uuid,
	user_id uuid,
	club_id uuid,
	csrf_hash text,
	email text,
	display_name text,
	locale text,
	role text
)
	LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		WITH refreshed AS (
			UPDATE user_session AS s
			SET last_seen_at = now(), expires_at = now() + interval '30 days'
			WHERE s.token_hash = p_token_hash
				AND s.revoked_at IS NULL
				AND s.expires_at > now()
			RETURNING s.id, s.user_id, s.club_id, s.csrf_hash
		)
		SELECT s.id, s.user_id, s.club_id, s.csrf_hash, u.email, u.display_name, u.locale, m.role
		FROM refreshed AS s
		JOIN app_user AS u ON u.id = s.user_id
		JOIN membership AS m ON m.user_id = s.user_id AND m.club_id = s.club_id
	$$;
--> statement-breakpoint

-- The members of the club in the current transaction (withTenant), with their e-mail, for the
-- admin page. app_user is not readable by the app; this exposes only this club's members.
CREATE FUNCTION rowlens_club_members()
RETURNS TABLE(user_id uuid, email text, role text, joined_at timestamptz, last_seen_at timestamptz)
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT u.id, u.email, m.role, m.created_at,
			(SELECT max(s.last_seen_at) FROM user_session AS s
			 WHERE s.user_id = m.user_id AND s.club_id = m.club_id)
		FROM membership AS m
		JOIN app_user AS u ON u.id = m.user_id
		WHERE m.club_id = nullif(current_setting('app.club_id', true), '')::uuid
	$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION rowlens_auth_access(text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_auth_ensure_user(text, text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_auth_session(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_club_members() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_access(text, text) TO rowlens_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_ensure_user(text, text, text, text, text) TO rowlens_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_session(text) TO rowlens_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_club_members() TO rowlens_app;
