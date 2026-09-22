-- Rebuild to expand the MIME constraint; original IDs, keys and metadata survive.
CREATE TABLE images_v2 (
 id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 255),
 size INTEGER NOT NULL CHECK(size > 0 AND size <= 20971520),
 mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif')),
 original_key TEXT NOT NULL UNIQUE, thumbnail_key TEXT UNIQUE,
 width INTEGER, height INTEGER, description TEXT NOT NULL DEFAULT '',
 tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
 album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL, deleted_at TEXT,
 preview_key TEXT UNIQUE, favorite INTEGER NOT NULL DEFAULT 0,
 purge_started_at TEXT
);
INSERT INTO images_v2 (id,name,size,mime,original_key,thumbnail_key,width,height,description,tags,album_id,created_at,deleted_at)
 SELECT id,name,size,mime,original_key,thumbnail_key,width,height,description,tags,album_id,created_at,deleted_at FROM images;
DROP TABLE images;
ALTER TABLE images_v2 RENAME TO images;
CREATE INDEX images_created_at ON images(created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX images_album_created_at ON images(album_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX images_deleted_at ON images(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE TABLE api_tokens (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
