-- Add 'breakout' to the valid game IDs constraint
-- The original constraint only included: snake, ping, drbloc, solitaire, angryblocs, hextris, endless-runner, flappy-bird, 2048

-- Drop the old constraint
ALTER TABLE game_scores DROP CONSTRAINT IF EXISTS valid_game_id;

-- Add new constraint with breakout included
ALTER TABLE game_scores ADD CONSTRAINT valid_game_id CHECK (
  game_id IN ('snake', 'ping', 'drbloc', 'solitaire', 'angryblocs', 'hextris', 'endless-runner', 'flappy-bird', '2048', 'breakout')
);
