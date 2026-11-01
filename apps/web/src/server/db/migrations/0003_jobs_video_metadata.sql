CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'dead');--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "job_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "job" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "processing_progress" smallint;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "fps_num" integer;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "fps_den" integer;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "height" integer;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "frame_count" integer;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "codec" text;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "rotation" smallint;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "vfr" boolean;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "renditions" jsonb;--> statement-breakpoint
ALTER TABLE "video" ADD COLUMN "renditions_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_club_id_club_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."club"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_ready_idx" ON "job" USING btree ("status","run_after");--> statement-breakpoint
CREATE POLICY "job_tenant" ON "job" AS PERMISSIVE FOR ALL TO "rowlens_app" USING ("job"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid) WITH CHECK ("job"."club_id" = nullif(current_setting('app.club_id', true), '')::uuid);--> statement-breakpoint
-- Claims the next job of the given types for `worker_id` (ADR-0008). SECURITY DEFINER because the
-- worker can't see other clubs' jobs before it knows which club to act in; it returns only what the
-- worker needs, and the worker then does everything in that job's club (withTenant / RLS).
-- Jobs whose lease expired are taken over; those out of attempts are marked dead first.
CREATE FUNCTION rowlens_claim_job(worker_id text, job_types text[], lease_seconds integer)
  RETURNS TABLE (id uuid, club_id uuid, type text, payload jsonb, attempts integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  UPDATE job AS j
     SET status = 'dead', finished_at = now(), locked_by = NULL, locked_until = NULL,
         last_error = coalesce(j.last_error, 'lease expired on the last attempt')
   WHERE j.status = 'running' AND j.locked_until < now() AND j.attempts >= j.max_attempts;

  RETURN QUERY
  UPDATE job AS j
     SET status = 'running', attempts = j.attempts + 1, locked_by = worker_id,
         locked_until = now() + make_interval(secs => lease_seconds)
   WHERE j.id = (
           SELECT c.id FROM job AS c
            WHERE c.type = ANY (job_types)
              AND ((c.status = 'queued' AND c.run_after <= now())
                   OR (c.status = 'running' AND c.locked_until < now()))
            ORDER BY c.run_after
            FOR UPDATE SKIP LOCKED
            LIMIT 1)
  RETURNING j.id, j.club_id, j.type, j.payload, j.attempts;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_claim_job(text, text[], integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION rowlens_claim_job(text, text[], integer) TO rowlens_app;
--> statement-breakpoint
-- Wakes idle workers (LISTEN rowlens_jobs); they also poll, so a missed notification only delays.
CREATE FUNCTION rowlens_notify_job() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('rowlens_jobs', NEW.type);
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER job_notify AFTER INSERT ON job FOR EACH ROW EXECUTE FUNCTION rowlens_notify_job();
--> statement-breakpoint
-- Renditions count against the media cap too (ADR-0006).
CREATE OR REPLACE FUNCTION rowlens_media_bytes() RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT coalesce(sum(size_bytes + renditions_bytes), 0)::bigint FROM video WHERE status <> 'rejected' $$;
