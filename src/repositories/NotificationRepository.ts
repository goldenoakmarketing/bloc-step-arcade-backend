import { supabase } from '../config/supabase.js';
import { createChildLogger } from '../utils/logger.js';

const logger = createChildLogger('NotificationRepository');

export interface NotificationToken {
  id: string;
  walletAddress: string;
  farcasterFid: number;
  notificationUrl: string;
  notificationToken: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationTokenRow {
  id: string;
  wallet_address: string;
  farcaster_fid: number;
  notification_url: string;
  notification_token: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export class NotificationRepository {
  async upsert(data: {
    walletAddress: string;
    farcasterFid: number;
    notificationUrl: string;
    notificationToken: string;
  }): Promise<NotificationToken> {
    const { data: result, error } = await supabase
      .from('notification_tokens')
      .upsert(
        {
          wallet_address: data.walletAddress.toLowerCase(),
          farcaster_fid: data.farcasterFid,
          notification_url: data.notificationUrl,
          notification_token: data.notificationToken,
          enabled: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'farcaster_fid' }
      )
      .select()
      .single();

    if (error) {
      logger.error({ error, fid: data.farcasterFid }, 'Error upserting notification token');
      throw new Error('Failed to save notification token');
    }

    return this.mapToNotificationToken(result);
  }

  async findByFid(fid: number): Promise<NotificationToken | null> {
    const { data, error } = await supabase
      .from('notification_tokens')
      .select('*')
      .eq('farcaster_fid', fid)
      .eq('enabled', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, fid }, 'Error fetching notification token');
    }

    return data ? this.mapToNotificationToken(data) : null;
  }

  async findByWallet(walletAddress: string): Promise<NotificationToken | null> {
    const { data, error } = await supabase
      .from('notification_tokens')
      .select('*')
      .eq('wallet_address', walletAddress.toLowerCase())
      .eq('enabled', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ error, walletAddress }, 'Error fetching notification token');
    }

    return data ? this.mapToNotificationToken(data) : null;
  }

  async disable(fid: number): Promise<void> {
    const { error } = await supabase
      .from('notification_tokens')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('farcaster_fid', fid);

    if (error) {
      logger.error({ error, fid }, 'Error disabling notification token');
    }
  }

  async enable(fid: number, notificationUrl: string, notificationToken: string): Promise<void> {
    const { error } = await supabase
      .from('notification_tokens')
      .update({
        enabled: true,
        notification_url: notificationUrl,
        notification_token: notificationToken,
        updated_at: new Date().toISOString(),
      })
      .eq('farcaster_fid', fid);

    if (error) {
      logger.error({ error, fid }, 'Error enabling notification token');
    }
  }

  async findAllEnabled(): Promise<NotificationToken[]> {
    const { data, error } = await supabase
      .from('notification_tokens')
      .select('*')
      .eq('enabled', true);

    if (error) {
      logger.error({ error }, 'Error fetching all enabled tokens');
      return [];
    }

    return (data || []).map(this.mapToNotificationToken);
  }

  private mapToNotificationToken(data: NotificationTokenRow): NotificationToken {
    return {
      id: data.id,
      walletAddress: data.wallet_address,
      farcasterFid: data.farcaster_fid,
      notificationUrl: data.notification_url,
      notificationToken: data.notification_token,
      enabled: data.enabled,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}

export const notificationRepository = new NotificationRepository();
