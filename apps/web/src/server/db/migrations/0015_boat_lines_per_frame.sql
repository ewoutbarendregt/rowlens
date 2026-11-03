-- Several boat lines per video, each from its frame on (ADR-0017 addendum): a moving camera turns the
-- boat in the picture. Existing lines start at frame 0, so they keep applying to the whole video.
ALTER TABLE "video_boat_line" ADD COLUMN "frame" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_boat_line" DROP CONSTRAINT "video_boat_line_pkey";--> statement-breakpoint
ALTER TABLE "video_boat_line" ADD CONSTRAINT "video_boat_line_pk" PRIMARY KEY("video_id","frame");--> statement-breakpoint
ALTER TABLE "video_boat_line" ADD CONSTRAINT "video_boat_line_frame_check" CHECK ("video_boat_line"."frame" >= 0);
