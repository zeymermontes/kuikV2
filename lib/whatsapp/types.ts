export type WhatsappNumberStatus =
  | 'pending' | 'pairing' | 'connected' | 'disconnected' | 'error' | 'banned';

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
  mode: 'coexistence' | 'cloud_api' | 'bridge';
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
  /** DEPRECATED since 0057 — superseded by active_flow_run_id. */
  active_goal_id: string | null;
  /** DEPRECATED since 0057 — run state lives on whatsapp_flow_runs. */
  state: Record<string, unknown>;
  active_flow_run_id: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  reservation_id: string | null;
}

/* ---------------------------------------------------------------- flows */

export type FlowRunStatus =
  | 'active' | 'completed' | 'abandoned' | 'expired' | 'handoff' | 'canceled';

export type FlowRunEngine = 'linear' | 'ai';

/** One stored answer inside whatsapp_flow_runs.answers. */
export interface FlowRunAnswer {
  value: string | number;
  at: string;
  source: 'button' | 'text' | 'ai';
}

export interface WhatsappFlow {
  id: string;
  tenant_id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  triggers: { kind: 'keyword' | 'regex' | 'interactive_id'; value: string }[];
  mode: FlowRunEngine;
  /** See lib/whatsapp/flows/schema.ts for the graph shape. */
  draft_graph: Record<string, unknown>;
  /** 0 = never published; the runnable graph is in whatsapp_flow_versions. */
  published_version: number;
  nudge_after_minutes: number | null;
  max_nudges: number;
  nudge_message: string | null;
  close_after_minutes: number | null;
  close_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsappFlowVersion {
  id: string;
  flow_id: string;
  tenant_id: string;
  version: number;
  graph: Record<string, unknown>;
  published_at: string;
  published_by: string | null;
}

export interface WhatsappFlowRun {
  id: string;
  tenant_id: string;
  flow_id: string;
  flow_version: number;
  conversation_id: string;
  contact_id: string;
  status: FlowRunStatus;
  engine: FlowRunEngine;
  current_node_id: string | null;
  answers: Record<string, FlowRunAnswer>;
  extra_data: Record<string, string>;
  nudge_count: number;
  nudge_due_at: string | null;
  close_due_at: string | null;
  ended_reason: string | null;
  action_result: Record<string, unknown> | null;
  started_at: string;
  last_inbound_at: string | null;
  completed_at: string | null;
  ended_at: string | null;
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
