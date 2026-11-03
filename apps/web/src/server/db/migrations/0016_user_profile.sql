ALTER TABLE "app_user" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "default_boat_type" text;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_name_check" CHECK (("app_user"."first_name" is null or char_length("app_user"."first_name") between 1 and 60) and ("app_user"."last_name" is null or char_length("app_user"."last_name") between 1 and 60));--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_default_boat_check" CHECK (default_boat_type is null or default_boat_type in ('C1x', 'C2x', 'C2x+', 'C4x+', 'C4+', '1x', '2x', '2-', '2+', '4x', '4-', '4+', '4x+', '8+'));--> statement-breakpoint
-- The signed-in member's own profile (2026-11-03): name and default boat. The app role can't touch
-- app_user (0006); these reach only the row of rowlens_user_id(), the session's own user.
CREATE FUNCTION rowlens_my_profile()
RETURNS TABLE(first_name text, last_name text, default_boat_type text)
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT u.first_name, u.last_name, u.default_boat_type FROM app_user AS u
		WHERE u.id = rowlens_user_id()
	$$;
--> statement-breakpoint
-- Sets the own name and default boat; the display name (author of notes, "writing as") follows.
CREATE FUNCTION rowlens_set_my_profile(p_first text, p_last text, p_boat text) RETURNS void
	LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
	DECLARE
		v_user uuid := rowlens_user_id();
		v_first text := btrim(p_first);
		v_last text := btrim(p_last);
	BEGIN
		IF v_user IS NULL THEN
			RAISE EXCEPTION 'rowlens_set_my_profile: no signed-in user';
		END IF;
		UPDATE app_user
			SET first_name = v_first, last_name = v_last, default_boat_type = p_boat,
				display_name = v_first || ' ' || v_last
			WHERE id = v_user;
	END
	$$;
--> statement-breakpoint
-- The club's members now come with their names (who made a session, the admin's lists).
DROP FUNCTION rowlens_club_members();
--> statement-breakpoint
CREATE FUNCTION rowlens_club_members()
RETURNS TABLE(user_id uuid, email text, role text, joined_at timestamptz, last_seen_at timestamptz,
	first_name text, last_name text)
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT u.id, u.email, m.role, m.created_at,
			(SELECT max(s.last_seen_at) FROM user_session AS s
			 WHERE s.user_id = m.user_id AND s.club_id = m.club_id),
			u.first_name, u.last_name
		FROM membership AS m
		JOIN app_user AS u ON u.id = m.user_id
		WHERE m.club_id = nullif(current_setting('app.club_id', true), '')::uuid
	$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_my_profile() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_set_my_profile(text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_club_members() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_my_profile() TO rowlens_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_set_my_profile(text, text, text) TO rowlens_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_club_members() TO rowlens_app;
