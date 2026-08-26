export type WhatsappNumberStatus =
  | 'pending' | 'connected' | 'disconnected' | 'error' | 'banned';

export interface WhatsappNumber {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  waba_id: string;
  /** THE routing key: one WABA can hold several numbers. */
  phone_number_id: string;
  display_phone_number: string;
  phone_e164: string;
  verified_name: string | null;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  mode: 'coexistence' | 'cloud_api';
  status: WhatsappNumberStatus;
  is_default: boolean;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  error_code: string | null;
  error_message: string | null;
}

export interface WhatsappConversation {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  phone_number_id: string;
  contact_id: string;
  status: 'open' | 'closed';
  /** Last CUSTOMER inbound + 24h. Null means never opened. */
  window_expires_at: string | null;
  bot_enabled: boolean;
  handoff_at: string | null;
  handoff_by: string | null;
  active_goal_id: string | null;
  state: Record<string, unknown>;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  reservation_id: string | null;
}

export interface WhatsappContact {
  id: string;
  tenant_id: string;
  /** Verbatim from Meta. Never rebuild it — see lib/phone.ts. */
  wa_id: string;
  phone_e164: string;
  profile_name: string | null;
  is_blocked: boolean;
  opted_out: boolean;
}

export type MessageOrigin =
  | 'customer' | 'bot' | 'staff_dashboard' | 'staff_device' | 'system';

/** An outbound message before it has been given to Meta. */
export interface OutboundDraft {
  type: 'text' | 'interactive';
  body: string;
  /** Up to 3 quick-reply buttons, or a list. Ids come back verbatim. */
  buttons?: { id: string; title: string }[];
  list?: {
    button: string;
    sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
  };
}
