-- Staking rewards distribution history
-- Tracks weekly reward distributions to stakers

CREATE TABLE IF NOT EXISTS staking_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(42) NOT NULL,
    amount_tokens DECIMAL(28, 18) NOT NULL,
    tx_hash VARCHAR(66) UNIQUE,
    distributed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staking_rewards_wallet ON staking_rewards(wallet_address);
CREATE INDEX IF NOT EXISTS idx_staking_rewards_distributed ON staking_rewards(distributed_at);

-- Enable RLS
ALTER TABLE staking_rewards ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access" ON staking_rewards FOR ALL USING (true);

COMMENT ON TABLE staking_rewards IS 'History of weekly staking reward distributions';
COMMENT ON COLUMN staking_rewards.amount_tokens IS 'Reward amount in BLOC tokens (not wei)';
