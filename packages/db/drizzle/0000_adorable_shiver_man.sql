CREATE TYPE "public"."account_status" AS ENUM('pending', 'connected', 'error', 'disconnected');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('running', 'succeeded', 'failed', 'budget_exceeded');--> statement-breakpoint
CREATE TYPE "public"."business_category" AS ENUM('game', 'saas', 'mobile_app', 'local_business', 'other');--> statement-breakpoint
CREATE TYPE "public"."content_language" AS ENUM('en', 'he');--> statement-breakpoint
CREATE TYPE "public"."mailbox_status" AS ENUM('pending_dns', 'provisioning', 'active', 'error');--> statement-breakpoint
CREATE TYPE "public"."metric_name" AS ENUM('impressions', 'reach', 'views', 'likes', 'comments', 'shares', 'saves', 'clicks', 'followers', 'replies', 'reposts', 'score', 'upvote_ratio', 'watch_time_seconds');--> statement-breakpoint
CREATE TYPE "public"."account_ownership" AS ENUM('owned', 'community');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('bluesky', 'telegram', 'discord', 'facebook', 'instagram', 'threads', 'linkedin', 'x', 'reddit', 'tiktok', 'youtube', 'pinterest', 'google_business', 'product_hunt', 'hacker_news', 'itch_io', 'steam');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'awaiting_approval', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('open', 'accepted', 'dismissed', 'implemented');--> statement-breakpoint
CREATE TYPE "public"."recommendation_type" AS ENUM('marketing', 'product');--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"job_name" text NOT NULL,
	"agent" text NOT NULL,
	"model" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'running' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"decision_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"category" "business_category" DEFAULT 'other' NOT NULL,
	"languages" jsonb DEFAULT '["en"]'::jsonb NOT NULL,
	"primary_language" "content_language" DEFAULT 'en' NOT NULL,
	"website_url" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_url" text,
	"domain" text,
	"target_region" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"weights" jsonb,
	"ai_monthly_budget_usd" numeric(10, 2) DEFAULT '50' NOT NULL,
	"posthog_project_id" text,
	"posthog_project_token" text,
	"app_repo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"audience_fit" text,
	"rules_summary" text,
	"approval_required" boolean DEFAULT true NOT NULL,
	"last_posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"address" text NOT NULL,
	"provider" text NOT NULL,
	"forward_to" text,
	"status" "mailbox_status" DEFAULT 'pending_dns' NOT NULL,
	"dns_records" jsonb,
	"password_enc" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mailboxes_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"account_id" uuid,
	"post_id" uuid,
	"platform" "platform" NOT NULL,
	"metric" "metric_name" NOT NULL,
	"value" numeric(18, 4) NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"code_verifier" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text,
	"token_type" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_tokens_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"ownership" "account_ownership" DEFAULT 'owned' NOT NULL,
	"external_id" text,
	"handle" text,
	"display_name" text,
	"profile_url" text,
	"status" "account_status" DEFAULT 'pending' NOT NULL,
	"wizard_step" integer DEFAULT 0 NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"account_id" uuid,
	"community_id" uuid,
	"platform" "platform" NOT NULL,
	"language" "content_language" DEFAULT 'en' NOT NULL,
	"pillar_id" text,
	"title" text,
	"body" text NOT NULL,
	"hashtags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"link_url" text,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"variant_group" text,
	"variant_label" text,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"external_id" text,
	"external_url" text,
	"rationale" text,
	"compliance" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"generated_by_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_analytics_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"type" "recommendation_type" NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"evidence" text,
	"effort" text,
	"expected_impact" text,
	"status" "recommendation_status" DEFAULT 'open' NOT NULL,
	"pr_url" text,
	"run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"email_verified" timestamp with time zone,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_plans" ADD CONSTRAINT "channel_plans_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communities" ADD CONSTRAINT "communities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_account_id_platform_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_account_id_platform_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_account_id_platform_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_community_id_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_analytics_snapshots" ADD CONSTRAINT "product_analytics_snapshots_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_business_time" ON "agent_runs" USING btree ("business_id","started_at");--> statement-breakpoint
CREATE INDEX "audit_log_business_time" ON "audit_log" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_user_slug" ON "businesses" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "metric_snapshots_business_time" ON "metric_snapshots" USING btree ("business_id","captured_at");--> statement-breakpoint
CREATE INDEX "metric_snapshots_post" ON "metric_snapshots" USING btree ("post_id","metric");--> statement-breakpoint
CREATE INDEX "platform_accounts_business" ON "platform_accounts" USING btree ("business_id","platform");--> statement-breakpoint
CREATE INDEX "posts_business_status" ON "posts" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "posts_due" ON "posts" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "product_analytics_business_kind" ON "product_analytics_snapshots" USING btree ("business_id","kind","period_end");