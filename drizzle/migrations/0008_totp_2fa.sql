ALTER TABLE "users" ADD COLUMN "totp_secret" text;
ALTER TABLE "users" ADD COLUMN "totp_pending_secret" text;
ALTER TABLE "users" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;
