CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_identifier_token" ON "verification_tokens" USING btree ("identifier","token");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_accounts_one_owned_per_platform" ON "platform_accounts" USING btree ("business_id","platform") WHERE ownership = 'owned';