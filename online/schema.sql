CREATE TABLE IF NOT EXISTS runs (
  token TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  world INTEGER NOT NULL CHECK(world IN (1,2)),
  stage INTEGER NOT NULL CHECK(stage BETWEEN 0 AND 11),
  jet INTEGER NOT NULL CHECK(jet BETWEEN 0 AND 4),
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','normal','hard')),
  started_at INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'stage' CHECK(mode IN ('stage','rank'))
);
CREATE INDEX IF NOT EXISTS idx_runs_player_time ON runs(player_id, started_at);
CREATE TABLE IF NOT EXISTS rankings (
  run_token TEXT PRIMARY KEY REFERENCES runs(token),
  name TEXT NOT NULL,
  world INTEGER NOT NULL CHECK(world IN (1,2)),
  stage INTEGER NOT NULL,
  jet INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 1800 AND score % 100 = 0),
  cleared INTEGER NOT NULL CHECK(cleared IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rankings_world_score ON rankings(world, score DESC, cleared DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS rank_challenges (
  run_token TEXT PRIMARY KEY REFERENCES runs(token),
  name TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 50000),
  cleared INTEGER NOT NULL CHECK(cleared=1),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS player_rank_resets (
  player_id TEXT PRIMARY KEY,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS game_accounts (
  account_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
