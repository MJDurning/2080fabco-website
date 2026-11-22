ALTER TABLE project_reviews ADD COLUMN photo BLOB CHECK (photo IS NULL OR length(photo) BETWEEN 1 AND 1000000);
ALTER TABLE project_reviews ADD COLUMN photo_sha256 TEXT CHECK ((photo IS NULL) = (photo_sha256 IS NULL));
ALTER TABLE project_reviews ADD COLUMN photo_published INTEGER NOT NULL DEFAULT 0 CHECK (
  photo_published IN (0, 1) AND (photo_published = 0 OR (photo IS NOT NULL AND status = 'approved' AND permission = 1))
);
