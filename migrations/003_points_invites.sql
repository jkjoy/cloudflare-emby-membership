-- 积分余额表
CREATE TABLE IF NOT EXISTS user_points (
  user_id      INTEGER PRIMARY KEY,
  balance      INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent  INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 积分流水表
CREATE TABLE IF NOT EXISTS point_transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  points      INTEGER NOT NULL,
  type        TEXT NOT NULL,
  source_id   TEXT,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 每日签到表：同一用户同一天只能签到一次
CREATE TABLE IF NOT EXISTS daily_checkins (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  checkin_date TEXT NOT NULL,
  points       INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, checkin_date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 用户邀请码表
CREATE TABLE IF NOT EXISTS user_invite_codes (
  user_id     INTEGER PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 邀请关系表：每个被邀请用户只能被奖励一次
CREATE TABLE IF NOT EXISTS invites (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_user_id   INTEGER NOT NULL,
  invitee_user_id   INTEGER NOT NULL UNIQUE,
  invite_code       TEXT NOT NULL,
  register_rewarded INTEGER NOT NULL DEFAULT 0,
  member_rewarded   INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (inviter_user_id) REFERENCES users(id),
  FOREIGN KEY (invitee_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_invites_inviter ON invites(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_invites_invitee ON invites(invitee_user_id);
