-- Game Champions table - stores PFP for #1 player of each game
-- This caches the champion's PFP so we don't have to fetch it every time the leaderboard image is generated

CREATE TABLE IF NOT EXISTS game_champions (
    game_id VARCHAR(50) PRIMARY KEY,
    wallet_address VARCHAR(42) NOT NULL,
    farcaster_fid BIGINT,
    farcaster_username VARCHAR(255),
    farcaster_pfp TEXT,
    score BIGINT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE game_champions ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access" ON game_champions FOR ALL USING (true);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_game_champions_game ON game_champions(game_id);
