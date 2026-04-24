ALTER TABLE "image_metadata" ADD COLUMN "labels" jsonb;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "overview_markdown" text;