-- Add stake_started_at column to track when a player's current stake began
-- Used for 7-day eligibility for weekly rewards

ALTER TABLE players ADD COLUMN IF NOT EXISTS stake_started_at TIMESTAMPTZ;

-- Index for efficient queries on eligible stakers
CREATE INDEX IF NOT EXISTS idx_players_stake_started ON players(stake_started_at) WHERE stake_started_at IS NOT NULL;

-- Comment explaining the column
COMMENT ON COLUMN players.stake_started_at IS 'Timestamp when player first staked (or restaked after unstaking all). Used for 7-day eligibility check.';
