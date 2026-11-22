CREATE TABLE project_reviews (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  project TEXT NOT NULL,
  feedback TEXT NOT NULL,
  permission INTEGER NOT NULL CHECK (permission IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'unpublished')),
  received_at INTEGER NOT NULL,
  published_at INTEGER,
  CHECK (
    (status = 'approved' AND permission = 1 AND published_at IS NOT NULL)
    OR (status != 'approved' AND published_at IS NULL)
  )
) STRICT;

CREATE INDEX published_reviews ON project_reviews (published_at DESC, id)
  WHERE status = 'approved' AND permission = 1;

CREATE TABLE review_admin_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
