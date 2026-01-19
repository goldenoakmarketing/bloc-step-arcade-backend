-- Bloc Step Arcade Backend - Initial Schema
-- Run this migration against your Supabase project

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Players table
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    farcaster_fid BIGINT UNIQUE,
    farcaster_username VARCHAR(255),
    cached_time_balance BIGINT DEFAULT 0,
    cached_staked_balance BIGINT DEFAULT 0,
    total_time_purchased BIGINT DEFAULT 0,
    total_time_consumed BIGINT DEFAULT 0,
    total_yeeted BIGINT DEFAULT 0,
    total_tips_sent BIGINT DEFAULT 0,
    total_tips_received BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_players_wallet ON players(wallet_address);
CREATE INDEX idx_players_fid ON players(farcaster_fid);

-- Game sessions table
CREATE TABLE game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id),
    wallet_address VARCHAR(42) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'expired')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    total_time_consumed BIGINT DEFAULT 0,
    last_consumption_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_game_sessions_player ON game_sessions(player_id);
CREATE INDEX idx_game_sessions_wallet ON game_sessions(wallet_address);
CREATE INDEX idx_game_sessions_status ON game_sessions(status);
CREATE INDEX idx_game_sessions_active ON game_sessions(wallet_address, status) WHERE status = 'active';

-- Time purchases (synced from TimePurchased events)
CREATE TABLE time_purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES players(id),
    wallet_address VARCHAR(42) NOT NULL,
    seconds_purchased BIGINT NOT NULL,
    cost_wei VARCHAR(78) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL UNIQUE,
    block_number BIGINT NOT NULL,
    log_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_purchases_wallet ON time_purchases(wallet_address);
CREATE INDEX idx_time_purchases_block ON time_purchases(block_number);

-- Time consumptions (backend calls to consumeTime)
CREATE TABLE time_consumptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES game_sessions(id),
    player_id UUID REFERENCES players(id),
    wallet_address VARCHAR(42) NOT NULL,
    seconds_consumed BIGINT NOT NULL,
    tx_hash VARCHAR(66) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_time_consumptions_session ON time_consumptions(session_id);
CREATE INDEX idx_time_consumptions_wallet ON time_consumptions(wallet_address);
CREATE INDEX idx_time_consumptions_status ON time_consumptions(status);

-- Yeet events (synced from YeetSent events)
CREATE TABLE yeet_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES players(id),
    wallet_address VARCHAR(42) NOT NULL,
    amount_wei VARCHAR(78) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL UNIQUE,
    block_number BIGINT NOT NULL,
    log_index INTEGER NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_yeet_events_wallet ON yeet_events(wallet_address);
CREATE INDEX idx_yeet_events_block ON yeet_events(block_number);
CREATE INDEX idx_yeet_events_timestamp ON yeet_events(event_timestamp);

-- Tips table (Farcaster tip transactions)
CREATE TABLE tips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_player_id UUID REFERENCES players(id),
    to_player_id UUID REFERENCES players(id),
    from_wallet VARCHAR(42) NOT NULL,
    to_wallet VARCHAR(42) NOT NULL,
    from_fid BIGINT,
    to_fid BIGINT,
    amount_wei VARCHAR(78) NOT NULL,
    tx_hash VARCHAR(66) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'confirmed', 'failed')),
    farcaster_cast_hash VARCHAR(66),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE INDEX idx_tips_from ON tips(from_wallet);
CREATE INDEX idx_tips_to ON tips(to_wallet);
CREATE INDEX idx_tips_status ON tips(status);

-- Leaderboard cache (pre-computed rankings)
CREATE TABLE leaderboard_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    leaderboard_type VARCHAR(50) NOT NULL,
    wallet_address VARCHAR(42) NOT NULL,
    player_id UUID REFERENCES players(id),
    rank INTEGER NOT NULL,
    score VARCHAR(78) NOT NULL,
    metadata JSONB DEFAULT '{}',
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(leaderboard_type, wallet_address)
);

CREATE INDEX idx_leaderboard_type ON leaderboard_cache(leaderboard_type);
CREATE INDEX idx_leaderboard_rank ON leaderboard_cache(leaderboard_type, rank);

-- Block sync state (event listener checkpoint)
CREATE TABLE block_sync_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_name VARCHAR(100) NOT NULL UNIQUE,
    contract_address VARCHAR(42) NOT NULL,
    last_synced_block BIGINT NOT NULL DEFAULT 0,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staking events (synced from Staked/Unstaked events)
CREATE TABLE staking_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES players(id),
    wallet_address VARCHAR(42) NOT NULL,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('stake', 'unstake')),
    amount_wei VARCHAR(78) NOT NULL,
    tx_hash VARCHAR(66) NOT NULL UNIQUE,
    block_number BIGINT NOT NULL,
    log_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_staking_events_wallet ON staking_events(wallet_address);
CREATE INDEX idx_staking_events_block ON staking_events(block_number);
CREATE INDEX idx_staking_events_type ON staking_events(event_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_sessions_updated_at
    BEFORE UPDATE ON game_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_block_sync_state_updated_at
    BEFORE UPDATE ON block_sync_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) - Enable but allow service role full access
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE yeet_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE block_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE staking_events ENABLE ROW LEVEL SECURITY;

-- Service role policies (full access)
CREATE POLICY "Service role full access" ON players FOR ALL USING (true);
CREATE POLICY "Service role full access" ON game_sessions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON time_purchases FOR ALL USING (true);
CREATE POLICY "Service role full access" ON time_consumptions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON yeet_events FOR ALL USING (true);
CREATE POLICY "Service role full access" ON tips FOR ALL USING (true);
CREATE POLICY "Service role full access" ON leaderboard_cache FOR ALL USING (true);
CREATE POLICY "Service role full access" ON block_sync_state FOR ALL USING (true);
CREATE POLICY "Service role full access" ON staking_events FOR ALL USING (true);
