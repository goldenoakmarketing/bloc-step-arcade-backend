-- Game scores table for tracking per-game leaderboards
CREATE TABLE IF NOT EXISTS game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  wallet_address TEXT NOT NULL,
  game_id TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  farcaster_username TEXT,
  farcaster_fid INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient leaderboard queries
CREATE INDEX IF NOT EXISTS idx_game_scores_game_score ON game_scores(game_id, score DESC);

-- Index for player lookups
CREATE INDEX IF NOT EXISTS idx_game_scores_wallet_game ON game_scores(wallet_address, game_id);

-- Validate game_id is one of the valid games
ALTER TABLE game_scores ADD CONSTRAINT valid_game_id CHECK (
  game_id IN ('snake', 'ping', 'drbloc', 'solitaire', 'angryblocs', 'hextris', 'endless-runner', 'flappy-bird', '2048')
);
