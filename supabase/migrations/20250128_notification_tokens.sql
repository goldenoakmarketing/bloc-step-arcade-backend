-- Create notification_tokens table for Farcaster Mini App notifications
CREATE TABLE IF NOT EXISTS notification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  farcaster_fid BIGINT NOT NULL UNIQUE,
  notification_url TEXT NOT NULL,
  notification_token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for wallet address lookups
CREATE INDEX IF NOT EXISTS idx_notification_tokens_wallet ON notification_tokens(wallet_address);

-- Index for FID lookups
CREATE INDEX IF NOT EXISTS idx_notification_tokens_fid ON notification_tokens(farcaster_fid);

-- Index for enabled status (for batch notifications)
CREATE INDEX IF NOT EXISTS idx_notification_tokens_enabled ON notification_tokens(enabled) WHERE enabled = true;

-- Comment on table
COMMENT ON TABLE notification_tokens IS 'Stores Farcaster notification tokens for users who have enabled notifications';
