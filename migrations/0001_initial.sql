PRAGMA foreign_keys = ON;

CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 1000),
  created_at TEXT NOT NULL
);

CREATE TABLE images (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 255),
  size INTEGER NOT NULL CHECK(size > 0 AND size <= 20971520),
  mime TEXT NOT NULL CHECK(mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  original_key TEXT NOT NULL UNIQUE,
  thumbnail_key TEXT UNIQUE,
  width INTEGER,
  height INTEGER,
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 2000),
  tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags)),
  album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX images_created_at ON images(created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX images_album_created_at ON images(album_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX images_deleted_at ON images(deleted_at) WHERE deleted_at IS NOT NULL;

-- Only a SHA-256 digest of the opaque session token is persisted.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- Keys are HMAC digests of trusted Cloudflare client IPs, never raw IPs.
CREATE TABLE login_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX login_attempts_expiry ON login_attempts(expires_at);
