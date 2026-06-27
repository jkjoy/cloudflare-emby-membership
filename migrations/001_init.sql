-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  email          TEXT,
  emby_username  TEXT,
  emby_user_id   TEXT,
  role           TEXT NOT NULL DEFAULT 'user',
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 会员记录表
CREATE TABLE IF NOT EXISTS memberships (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  days_added  INTEGER NOT NULL,
  start_date  TEXT NOT NULL,
  expire_date TEXT NOT NULL,
  source      TEXT NOT NULL,
  source_id   INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 卡密表
CREATE TABLE IF NOT EXISTS activation_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  days        INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  used_by     INTEGER,
  used_at     TEXT,
  created_by  INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  batch_id    TEXT,
  FOREIGN KEY (used_by) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 系统配置表
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_activation_codes_status ON activation_codes(status);
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);