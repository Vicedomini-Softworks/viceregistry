ALTER TABLE "organizations" ADD COLUMN "slug" text;
--> statement-breakpoint
UPDATE "organizations"
SET slug = COALESCE(
  NULLIF(
    LEFT(
      REGEXP_REPLACE(
        TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(name, '[^a-z0-9]+', '-', 'g'))),
        '-+', '-', 'g'
      ),
      39
    ),
    ''
  ),
  'org-' || LEFT(id::text, 8)
);
--> statement-breakpoint
DO $$
DECLARE
  dup RECORD;
  counter INT;
  base_slug TEXT;
BEGIN
  LOOP
    SELECT id, slug INTO dup
    FROM organizations o1
    WHERE (SELECT COUNT(*) FROM organizations o2 WHERE o2.slug = o1.slug AND o2.id != o1.id) > 0
    ORDER BY created_at DESC
    LIMIT 1;
    EXIT WHEN NOT FOUND;
    base_slug := LEFT(dup.slug, 36);
    counter := 2;
    LOOP
      EXIT WHEN NOT EXISTS (SELECT 1 FROM organizations WHERE slug = base_slug || '-' || counter);
      counter := counter + 1;
    END LOOP;
    UPDATE organizations SET slug = base_slug || '-' || counter WHERE id = dup.id;
  END LOOP;
END;
$$;
--> statement-breakpoint
ALTER TABLE "organizations" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_slug_unique" UNIQUE("slug");
