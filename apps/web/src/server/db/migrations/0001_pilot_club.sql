-- Club lookup by slug before any club context exists (the URL or the pilot gate names a club; RLS
-- hides every club row until withTenant sets one). SECURITY DEFINER with a pinned search_path; it
-- returns only the id, and only for an exact slug.
CREATE FUNCTION rowlens_club_id(club_slug text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT id FROM club WHERE slug = club_slug $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_club_id(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_club_id(text) TO rowlens_app;
--> statement-breakpoint
-- The one club of the pilot behind the access code (#84). Renamed or replaced when clubs onboard.
INSERT INTO club (slug, name) VALUES ('pilot', 'Pilot') ON CONFLICT (slug) DO NOTHING;
