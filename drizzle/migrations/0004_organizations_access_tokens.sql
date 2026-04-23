CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization_repositories" (
	"organization_id" uuid NOT NULL,
	"repository_name" text NOT NULL,
	CONSTRAINT "organization_repositories_organization_id_repository_name_pk" PRIMARY KEY("organization_id","repository_name")
);
--> statement-breakpoint
CREATE TABLE "user_repository_permissions" (
	"user_id" uuid NOT NULL,
	"repository_name" text NOT NULL,
	"permission" text DEFAULT 'pull' NOT NULL,
	CONSTRAINT "user_repository_permissions_user_id_repository_name_pk" PRIMARY KEY("user_id","repository_name")
);
--> statement-breakpoint
DROP TABLE "group_repositories" CASCADE;
--> statement-breakpoint
DROP TABLE "group_users" CASCADE;
--> statement-breakpoint
DROP TABLE "groups" CASCADE;
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD COLUMN "token_preview" text;
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD COLUMN "repository_name" text;
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD COLUMN "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_repositories" ADD CONSTRAINT "organization_repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_repositories" ADD CONSTRAINT "organization_repositories_repository_name_repositories_name_fk" FOREIGN KEY ("repository_name") REFERENCES "public"."repositories"("name") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_repository_permissions" ADD CONSTRAINT "user_repository_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_repository_permissions" ADD CONSTRAINT "user_repository_permissions_repository_name_repositories_name_fk" FOREIGN KEY ("repository_name") REFERENCES "public"."repositories"("name") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
