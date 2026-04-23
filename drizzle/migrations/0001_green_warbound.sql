CREATE TABLE "image_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository" text NOT NULL,
	"tag" text NOT NULL,
	"digest" text,
	"total_size" bigint,
	"os" text,
	"architecture" text,
	"created_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"name" text PRIMARY KEY NOT NULL,
	"tag_count" integer DEFAULT 0 NOT NULL,
	"size_bytes" bigint,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "image_metadata_repo_tag_idx" ON "image_metadata" USING btree ("repository","tag");