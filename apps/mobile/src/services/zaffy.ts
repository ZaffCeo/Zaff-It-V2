/**
 * Zaffy AI assistant client — typed wrapper over the zaffy-ai-assistant
 * edge function (orchestrator v14). Handles fresh-session tokens, consistent
 * error surfacing and the proposal confirmation lifecycle.
 */
import { SUPABASE_FUNCTIONS_URL, ensureFreshSession } from './supabase';

const FN = `${SUPABASE_FUNCTIONS_URL}/zaffy-ai-assistant`;

export type ZaffyLocale = 'en-IN' | 'hi' | 'hinglish';

export interface ZaffyProposal {
  id: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  expires_at: string;
  [k: string]: unknown;
}

export interface ZaffyChatResult {
  reply: string;
  conversation_id: string | null;
  proposals: ZaffyProposal[];
  tool_trace: Array<{ tool: string; ok: boolean; write: boolean }>;
  provider: string;
  model: string;
  mode: 'user' | 'anon';
  role: string;
}

export interface ZaffyConfirmResult {
  confirmed: boolean;
  action: string;
  result: Record<string, unknown>;
}

export interface ZaffyConversation {
  id: string;
  title: string;
  language: string;
  updated_at: string;
}

export interface ZaffyMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  provider?: string | null;
  model?: string | null;
  message_metadata?: Record<string, unknown>;
  created_at: string;
}

export interface ZaffyMemory {
  id: string;
  memory_type: string;
  memory_content: string;
  source: string;
  user_approved: boolean;
}

export interface ZaffySettings {
  preferred_language: ZaffyLocale;
  personality_mode: string;
  response_length: string;
  memory_enabled: boolean;
}

export class ZaffyApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { auth?: 'user' | 'anon' } = {}): Promise<T> {
  const { auth = 'user', ...rest } = init;
  const session = await ensureFreshSession();
  if (auth === 'user' && session.mode !== 'user') {
    throw new ZaffyApiError(401, 'SIGN_IN_REQUIRED', 'Zaffy ki poori power ke liye sign-in karein');
  }
  const res = await fetch(`${FN}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
      ...(rest.headers ?? {}),
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ZaffyApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Zaffy error ${res.status}`);
  }
  return body as T;
}

export const zaffyApi = {
  chat: (query: string, conversationId: string | null, locale: ZaffyLocale) =>
    call<ZaffyChatResult>('/chat', {
      method: 'POST',
      auth: 'anon',
      body: JSON.stringify({ query, conversation_id: conversationId, locale }),
    }),

  confirmAction: (proposalId: string) =>
    call<ZaffyConfirmResult>(`/actions/${proposalId}/confirm`, { method: 'POST' }),

  listConversations: () => call<{ conversations: ZaffyConversation[] }>('/conversations'),

  getConversation: (id: string) =>
    call<{ conversation: ZaffyConversation; messages: ZaffyMessage[] }>(`/conversations/${id}`),

  deleteConversation: (id: string) => call<{ deleted: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),

  listMemories: () => call<{ memories: ZaffyMemory[] }>('/memory'),

  addMemory: (memory_type: string, memory_content: string) =>
    call<{ memory: { id: string } }>('/memory', { method: 'POST', body: JSON.stringify({ memory_type, memory_content }) }),

  patchMemory: (id: string, patch: { user_approved?: boolean; memory_content?: string }) =>
    call<{ updated: boolean }>(`/memory/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteMemory: (id: string) => call<{ deleted: boolean }>(`/memory/${id}`, { method: 'DELETE' }),

  getSettings: () => call<{ settings: ZaffySettings }>('/settings'),

  saveSettings: (patch: Partial<ZaffySettings>) =>
    call<{ saved: boolean }>('/settings', { method: 'POST', body: JSON.stringify(patch) }),

  sendFeedback: (rating: number, conversationId: string | null, comment?: string) =>
    call<{ received: boolean }>('/feedback', {
      method: 'POST',
      body: JSON.stringify({ rating, conversation_id: conversationId ?? undefined, comment }),
    }),
};
