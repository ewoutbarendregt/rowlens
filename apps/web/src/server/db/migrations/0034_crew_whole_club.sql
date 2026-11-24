-- BUG-077: whoever may edit a training picks its crew from the whole club: every verified member
-- (any role) plus name-only roster entries, and may add a name-only entry on the spot (amends
-- ADR-0021). Read access to rosters, trainings and notes is unchanged: the list comes only from
-- these functions, and only for a training the caller may edit.
CREATE FUNCTION rowlens_crew_target(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM rower r
  WHERE r.id=p_id AND r.club_id=nullif(current_setting('app.club_id',true),'')::uuid
  AND r.archived_at IS NULL AND (r.user_id IS NULL OR EXISTS(SELECT 1 FROM app_user u
   JOIN membership m ON m.user_id=u.id AND m.club_id=r.club_id
   WHERE u.id=r.user_id AND u.verified_at IS NOT NULL)))
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_crew_candidates(p_session uuid)
RETURNS TABLE(id uuid,display_name text,mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT r.id,r.display_name,coalesce(r.user_id=rowlens_user_id(),false) FROM rower r
 WHERE rowlens_can_edit_session(p_session)
 AND r.club_id=nullif(current_setting('app.club_id',true),'')::uuid AND rowlens_crew_target(r.id)
$$;
--> statement-breakpoint
CREATE FUNCTION rowlens_add_crew_name(p_session uuid,p_name text)
RETURNS TABLE(id uuid,display_name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT rowlens_can_edit_session(p_session) THEN RETURN; END IF;
 RETURN QUERY INSERT INTO rower AS r(club_id,display_name)
  VALUES(nullif(current_setting('app.club_id',true),'')::uuid,btrim(p_name))
  RETURNING r.id,r.display_name;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_crew_target(uuid),rowlens_crew_candidates(uuid),rowlens_add_crew_name(uuid,text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_crew_target(uuid),rowlens_crew_candidates(uuid),rowlens_add_crew_name(uuid,text) TO rowlens_app;
