-- Lost & Found Pool Tables
-- Migration: 002_lost_found_pool.sql

CREATE TABLE IF NOT EXISTS lost_found_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance INTEGER NOT NULL DEFAULT 0,
  total_received INTEGER NOT NULL DEFAULT 0,
  total_claimed INTEGER NOT NULL DEFAULT 0,
  total_overflow INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lost_found_pool_singleton ON lost_found_pool ((true));

INSERT INTO lost_found_pool (balance, total_received, total_claimed, total_overflow)
VALUES (0, 0, 0, 0)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS pool_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  wallet_address TEXT NOT NULL,
  last_claim_time TIMESTAMPTZ,
  streak INTEGER NOT NULL DEFAULT 0,
  total_claimed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wallet_address)
);

CREATE INDEX IF NOT EXISTS pool_claims_wallet_idx ON pool_claims(wallet_address);

CREATE TABLE IF NOT EXISTS pool_claim_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  wallet_address TEXT NOT NULL,
  quarters_claimed INTEGER NOT NULL,
  streak_at_claim INTEGER NOT NULL,
  pool_balance_after INTEGER NOT NULL,
  tx_hash TEXT,
  claimed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pool_claim_history_wallet_idx ON pool_claim_history(wallet_address);
