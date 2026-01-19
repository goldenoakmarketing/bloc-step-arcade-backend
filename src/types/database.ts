export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      players: {
        Row: {
          id: string;
          wallet_address: string;
          farcaster_fid: number | null;
          farcaster_username: string | null;
          cached_time_balance: number;
          cached_staked_balance: number;
          total_time_purchased: number;
          total_time_consumed: number;
          total_yeeted: number;
          total_tips_sent: number;
          total_tips_received: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          wallet_address: string;
          farcaster_fid?: number | null;
          farcaster_username?: string | null;
          cached_time_balance?: number;
          cached_staked_balance?: number;
          total_time_purchased?: number;
          total_time_consumed?: number;
          total_yeeted?: number;
          total_tips_sent?: number;
          total_tips_received?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          wallet_address?: string;
          farcaster_fid?: number | null;
          farcaster_username?: string | null;
          cached_time_balance?: number;
          cached_staked_balance?: number;
          total_time_purchased?: number;
          total_time_consumed?: number;
          total_yeeted?: number;
          total_tips_sent?: number;
          total_tips_received?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      game_sessions: {
        Row: {
          id: string;
          player_id: string;
          wallet_address: string;
          status: string;
          started_at: string;
          ended_at: string | null;
          total_time_consumed: number;
          last_consumption_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          player_id: string;
          wallet_address: string;
          status?: string;
          started_at?: string;
          ended_at?: string | null;
          total_time_consumed?: number;
          last_consumption_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string;
          wallet_address?: string;
          status?: string;
          started_at?: string;
          ended_at?: string | null;
          total_time_consumed?: number;
          last_consumption_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      time_purchases: {
        Row: {
          id: string;
          player_id: string | null;
          wallet_address: string;
          seconds_purchased: number;
          cost_wei: string;
          tx_hash: string;
          block_number: number;
          log_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id?: string | null;
          wallet_address: string;
          seconds_purchased: number;
          cost_wei: string;
          tx_hash: string;
          block_number: number;
          log_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string | null;
          wallet_address?: string;
          seconds_purchased?: number;
          cost_wei?: string;
          tx_hash?: string;
          block_number?: number;
          log_index?: number;
          created_at?: string;
        };
      };
      time_consumptions: {
        Row: {
          id: string;
          session_id: string | null;
          player_id: string | null;
          wallet_address: string;
          seconds_consumed: number;
          tx_hash: string | null;
          status: string;
          error_message: string | null;
          created_at: string;
          confirmed_at: string | null;
        };
        Insert: {
          id?: string;
          session_id?: string | null;
          player_id?: string | null;
          wallet_address: string;
          seconds_consumed: number;
          tx_hash?: string | null;
          status?: string;
          error_message?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Update: {
          id?: string;
          session_id?: string | null;
          player_id?: string | null;
          wallet_address?: string;
          seconds_consumed?: number;
          tx_hash?: string | null;
          status?: string;
          error_message?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
      };
      yeet_events: {
        Row: {
          id: string;
          player_id: string | null;
          wallet_address: string;
          amount_wei: string;
          tx_hash: string;
          block_number: number;
          log_index: number;
          event_timestamp: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id?: string | null;
          wallet_address: string;
          amount_wei: string;
          tx_hash: string;
          block_number: number;
          log_index: number;
          event_timestamp: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string | null;
          wallet_address?: string;
          amount_wei?: string;
          tx_hash?: string;
          block_number?: number;
          log_index?: number;
          event_timestamp?: string;
          created_at?: string;
        };
      };
      tips: {
        Row: {
          id: string;
          from_player_id: string | null;
          to_player_id: string | null;
          from_wallet: string;
          to_wallet: string;
          from_fid: number | null;
          to_fid: number | null;
          amount_wei: string;
          tx_hash: string | null;
          status: string;
          farcaster_cast_hash: string | null;
          error_message: string | null;
          created_at: string;
          confirmed_at: string | null;
        };
        Insert: {
          id?: string;
          from_player_id?: string | null;
          to_player_id?: string | null;
          from_wallet: string;
          to_wallet: string;
          from_fid?: number | null;
          to_fid?: number | null;
          amount_wei: string;
          tx_hash?: string | null;
          status?: string;
          farcaster_cast_hash?: string | null;
          error_message?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
        Update: {
          id?: string;
          from_player_id?: string | null;
          to_player_id?: string | null;
          from_wallet?: string;
          to_wallet?: string;
          from_fid?: number | null;
          to_fid?: number | null;
          amount_wei?: string;
          tx_hash?: string | null;
          status?: string;
          farcaster_cast_hash?: string | null;
          error_message?: string | null;
          created_at?: string;
          confirmed_at?: string | null;
        };
      };
      leaderboard_cache: {
        Row: {
          id: string;
          leaderboard_type: string;
          wallet_address: string;
          player_id: string | null;
          rank: number;
          score: string;
          metadata: Json;
          computed_at: string;
        };
        Insert: {
          id?: string;
          leaderboard_type: string;
          wallet_address: string;
          player_id?: string | null;
          rank: number;
          score: string;
          metadata?: Json;
          computed_at?: string;
        };
        Update: {
          id?: string;
          leaderboard_type?: string;
          wallet_address?: string;
          player_id?: string | null;
          rank?: number;
          score?: string;
          metadata?: Json;
          computed_at?: string;
        };
      };
      block_sync_state: {
        Row: {
          id: string;
          contract_name: string;
          contract_address: string;
          last_synced_block: number;
          last_synced_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          contract_name: string;
          contract_address: string;
          last_synced_block?: number;
          last_synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          contract_name?: string;
          contract_address?: string;
          last_synced_block?: number;
          last_synced_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      staking_events: {
        Row: {
          id: string;
          player_id: string | null;
          wallet_address: string;
          event_type: string;
          amount_wei: string;
          tx_hash: string;
          block_number: number;
          log_index: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_id?: string | null;
          wallet_address: string;
          event_type: string;
          amount_wei: string;
          tx_hash: string;
          block_number: number;
          log_index: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          player_id?: string | null;
          wallet_address?: string;
          event_type?: string;
          amount_wei?: string;
          tx_hash?: string;
          block_number?: number;
          log_index?: number;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
