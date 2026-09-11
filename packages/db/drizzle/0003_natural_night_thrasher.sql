ALTER TABLE "posts" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;