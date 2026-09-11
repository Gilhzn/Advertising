-- oauth_states rows live at most 10 minutes; drop any in-flight ones so the NOT NULL user_id can be added.
DELETE FROM "oauth_states";--> statement-breakpoint
ALTER TABLE "oauth_states" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;