import type { Reservation } from '@/lib/database.types';

export type NotificationKind = 'confirmed' | 'cancelled' | 'reminder_24h';
export type NotificationChannel = 'manual_wa' | 'whatsapp_api' | 'none';

export interface NotifyInput {
  tenant: { id: string; name: string; locale: string };
  reservation: Pick<
    Reservation,
    'id' | 'customer_name' | 'phone' | 'party_size' | 'date' | 'time'
  >;
  kind: NotificationKind;
  /** Already rendered and localised. */
  body: string;
}

export interface NotifyResult {
  status: 'sent' | 'queued' | 'skipped' | 'failed';
  /** Manual channel: the one-tap wa.me link a staff member opens. */
  href?: string;
  /** API channel: the provider's message id. */
  providerId?: string;
  error?: string;
}

export interface CustomerNotifier {
  channel: NotificationChannel;
  /** False means a human still has to tap something. */
  automatic: boolean;
  send(input: NotifyInput): Promise<NotifyResult>;
}
