INSERT INTO "roles" ("name", "description") VALUES
  ('admin',  'Full access including user management and image deletion'),
  ('push',   'Can push and pull images'),
  ('viewer', 'Read-only access to registry')
ON CONFLICT ("name") DO NOTHING;
