ALTER TABLE "angle_measure" ADD COLUMN "account_user_id" uuid;--> statement-breakpoint
ALTER TABLE "lineup_seat" ADD COLUMN "account_user_id" uuid;--> statement-breakpoint
ALTER TABLE "moment_rower" ADD COLUMN "account_user_id" uuid;--> statement-breakpoint
ALTER TABLE "moment_rower_log" ADD COLUMN "account_user_id" uuid;--> statement-breakpoint
ALTER TABLE "moment_share" ADD COLUMN "account_user_id" uuid;--> statement-breakpoint
ALTER TABLE "angle_measure" ADD CONSTRAINT "angle_measure_account_user_id_app_user_id_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_seat" ADD CONSTRAINT "lineup_seat_account_user_id_app_user_id_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_rower" ADD CONSTRAINT "moment_rower_account_user_id_app_user_id_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_rower_log" ADD CONSTRAINT "moment_rower_log_account_user_id_app_user_id_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moment_share" ADD CONSTRAINT "moment_share_account_user_id_app_user_id_fk" FOREIGN KEY ("account_user_id") REFERENCES "public"."app_user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Canonical user references are derived from the same-club compatibility identity, never request data.
CREATE FUNCTION rowlens_reference_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 SELECT r.user_id INTO NEW.account_user_id FROM rower r JOIN app_user u ON u.id=r.user_id
 WHERE r.id=NEW.rower_id AND r.club_id=NEW.club_id AND u.verified_at IS NOT NULL;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION rowlens_backfill_person_account() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.user_id IS NOT NULL AND EXISTS(SELECT 1 FROM app_user WHERE id=NEW.user_id AND verified_at IS NOT NULL) THEN
 UPDATE lineup_seat SET account_user_id=NEW.user_id WHERE club_id=NEW.club_id AND rower_id=NEW.id;
 UPDATE angle_measure SET account_user_id=NEW.user_id WHERE club_id=NEW.club_id AND rower_id=NEW.id;
 UPDATE moment_rower SET account_user_id=NEW.user_id WHERE club_id=NEW.club_id AND rower_id=NEW.id;
 UPDATE moment_share SET account_user_id=NEW.user_id WHERE club_id=NEW.club_id AND rower_id=NEW.id;
 UPDATE moment_rower_log SET account_user_id=NEW.user_id WHERE club_id=NEW.club_id AND rower_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['lineup_seat','angle_measure','moment_rower','moment_share','moment_rower_log'] LOOP
 EXECUTE format('UPDATE %I t SET account_user_id=r.user_id FROM rower r JOIN app_user u ON u.id=r.user_id WHERE t.rower_id=r.id AND t.club_id=r.club_id AND u.verified_at IS NOT NULL',t);
 EXECUTE format('CREATE TRIGGER reference_account BEFORE INSERT OR UPDATE OF rower_id,club_id,account_user_id ON %I FOR EACH ROW EXECUTE FUNCTION rowlens_reference_account()',t);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE TRIGGER backfill_person_account AFTER UPDATE OF user_id ON rower FOR EACH ROW EXECUTE FUNCTION rowlens_backfill_person_account();
--> statement-breakpoint
REVOKE ALL ON FUNCTION rowlens_reference_account(),rowlens_backfill_person_account() FROM PUBLIC;
