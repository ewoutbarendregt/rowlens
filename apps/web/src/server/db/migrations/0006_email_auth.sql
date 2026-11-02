CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'nl' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'coach' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_club_user_unique" UNIQUE("club_id","user_id"),
	CONSTRAINT "membership_role_check" CHECK ("membership"."role" in ('rower', 'coach'))
);
--> statement-breakpoint
ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "login_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"request_ip_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_code" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "user_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "user_session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Global, append-only rate-limit events. Identifiers are HMACed by the app before they reach this
-- table; only the narrow SECURITY DEFINER function below may read or write it.
CREATE TABLE "auth_event" (
	"id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	"kind" text NOT NULL,
	"key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "login_code" ADD CONSTRAINT "login_code_membership_fk" FOREIGN KEY ("club_id","user_id") REFERENCES "public"."membership"("club_id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_membership_fk" FOREIGN KEY ("club_id","user_id") REFERENCES "public"."membership"("club_id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "login_code_user_created_idx" ON "login_code" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX "user_session_user_idx" ON "user_session" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "auth_event_limit_idx" ON "auth_event" USING btree ("kind","key_hash","created_at");
--> statement-breakpoint
CREATE POLICY "membership_tenant" ON "membership" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("membership"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("membership"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "login_code_tenant" ON "login_code" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("login_code"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("login_code"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY "user_session_tenant" ON "user_session" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("user_session"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("user_session"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);
--> statement-breakpoint
REVOKE ALL ON TABLE "app_user", "auth_event" FROM "rowlens_app";
--> statement-breakpoint
REVOKE ALL ON SEQUENCE "auth_event_id_seq" FROM "rowlens_app";
--> statement-breakpoint

-- Provision an allowlisted address in the one configured club without granting the app direct
-- access to the global user table. The application performs the allowlist check before this call.
CREATE FUNCTION rowlens_auth_ensure_user(
	p_email text,
	p_display_name text,
	p_locale text,
	p_club_slug text
) RETURNS TABLE(user_id uuid, club_id uuid, email text, display_name text, locale text)
	LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
#variable_conflict use_column
DECLARE
	v_user_id uuid;
	v_club_id uuid;
BEGIN
	SELECT c.id INTO v_club_id FROM club AS c WHERE c.slug = p_club_slug;
	IF v_club_id IS NULL THEN
		RETURN;
	END IF;

	INSERT INTO app_user AS u (email, display_name, locale)
	VALUES (p_email, p_display_name, CASE WHEN p_locale = 'en' THEN 'en' ELSE 'nl' END)
	ON CONFLICT ON CONSTRAINT app_user_email_unique DO UPDATE SET email = excluded.email
	RETURNING u.id INTO v_user_id;

	INSERT INTO membership (club_id, user_id, role)
	VALUES (v_club_id, v_user_id, 'coach')
	ON CONFLICT (club_id, user_id) DO NOTHING;

	RETURN QUERY
	SELECT u.id, m.club_id, u.email, u.display_name, u.locale
	FROM app_user AS u
	JOIN membership AS m ON m.user_id = u.id
	WHERE u.id = v_user_id AND m.club_id = v_club_id;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION rowlens_auth_identity(p_email text)
RETURNS TABLE(user_id uuid, club_id uuid, email text, display_name text, locale text)
	LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
		SELECT u.id, m.club_id, u.email, u.display_name, u.locale
		FROM app_user AS u
		JOIN membership AS m ON m.user_id = u.id
		WHERE u.email = p_email
		ORDER BY m.created_at
		LIMIT 1
	$$;
--> statement-breakpoint

-- Resolve and slide a session without exposing the global user table or cross-tenant sessions.
CREATE FUNCTION rowlens_auth_session(p_token_hash text)
RETURNS TABLE(
	session_id uuid,
	user_id uuid,
	club_id uuid,
	csrf_hash text,
	email text,
	display_name text,
	locale text
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
		SELECT s.id, s.user_id, s.club_id, s.csrf_hash, u.email, u.display_name, u.locale
		FROM refreshed AS s
		JOIN app_user AS u ON u.id = s.user_id
	$$;
--> statement-breakpoint

-- Serialize equal buckets so concurrent requests cannot race past a limit.
CREATE FUNCTION rowlens_auth_rate_hit(
	p_kind text,
	p_key_hash text,
	p_window_seconds integer,
	p_maximum integer
) RETURNS boolean
	LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
	AS $$
DECLARE
	v_hits bigint;
BEGIN
	IF p_window_seconds < 1 OR p_maximum < 1 THEN
		RETURN false;
	END IF;
	PERFORM pg_advisory_xact_lock(hashtextextended(p_kind || ':' || p_key_hash, 0));
	SELECT count(*) INTO v_hits
	FROM auth_event AS e
	WHERE e.kind = p_kind
		AND e.key_hash = p_key_hash
		AND e.created_at > now() - make_interval(secs => p_window_seconds);
	IF v_hits >= p_maximum THEN
		RETURN false;
	END IF;
	INSERT INTO auth_event (kind, key_hash) VALUES (p_kind, p_key_hash);
	RETURN true;
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION rowlens_auth_ensure_user(text, text, text, text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_auth_identity(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_auth_session(text) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_auth_rate_hit(text, text, integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_ensure_user(text, text, text, text) TO rowlens_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_identity(text) TO rowlens_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_session(text) TO rowlens_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_auth_rate_hit(text, text, integer, integer) TO rowlens_app;
