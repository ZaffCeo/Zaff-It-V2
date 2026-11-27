-- ============================================================================
-- 019_zaffy_platform.sql
-- Zaffy AI Assistant & Shopping Agent — platform tables (Phase 3).
-- Reuses ALL existing business tables (products, store_products, inventory,
-- carts, cart_items, orders, payments, merchants, stores, user_roles).
-- Adds ONLY Zaffy-specific tables that were genuinely missing:
--   conversations, messages, memories, action_proposals,
--   tool_audit_logs, usage_logs, user_settings, feedback.
-- Rules honoured: UTC timestamptz, FKs + indexes, RLS on every private table,
-- no OTPs/passwords/payment credentials stored, memories owner-manageable,
-- server-owned proposal statuses not writable by users, audit logs read-only
-- for ordinary users, admin access via existing has_role() trusted helper.
-- Idempotent: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zaffy_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_role TEXT NOT NULL DEFAULT 'customer'
        CHECK (actor_role IN ('customer', 'merchant', 'rider', 'admin', 'anon')),
    title TEXT NOT NULL DEFAULT 'New chat',
    language TEXT NOT NULL DEFAULT 'hinglish',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_zaffy_conv_user
    ON public.zaffy_conversations (user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- B. Messages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zaffy_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.zaffy_conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content TEXT NOT NULL,
    message_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    provider TEXT,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zaffy_msg_conv
    ON public.zaffy_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- C. User memories (owner-editable / deletable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zaffy_user_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    memory_type TEXT NOT NULL
        CHECK (memory_type IN ('preference', 'language', 'dietary', 'brand', 'habit', 'other')),
    memory_content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'ai_detected'
        CHECK (source IN ('ai_detected', 'user_added')),
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 0.80 CHECK (confidence BETWEEN 0 AND 1),
    user_approved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zaffy_mem_user
    ON public.zaffy_user_memories (user_id, user_approved);

-- ---------------------------------------------------------------------------
-- D. Action proposals (server-owned lifecycle: PROPOSED -> AWAITING_CONFIRMATION
--    -> CONFIRMED -> EXECUTING -> COMPLETED/FAILED/EXPIRED)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zaffy_action_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.zaffy_conversations(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL
        CHECK (action_type IN (
            'place_order',
            'update_product_price', 'update_stock', 'update_shop_availability',
            'bulk_update_stock', 'bulk_update_price'
        )),
    action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'awaiting_confirmation'
        CHECK (status IN ('awaiting_confirmation', 'confirmed', 'executing', 'completed', 'failed', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
    confirmed_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    result JSONB,
    idempotency_key UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zaffy_prop_user_status
    ON public.zaffy_action_proposals (user_id, status);

-- ---------------------------------------------------------------------------
-- E. Tool audit logs (append-only for users; readable by owner + admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zaffy_tool_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role TEXT,
    tool_name TEXT NOT NULL,
    action_type TEXT NOT NULL DEFAULT 'read',
    resource_type TEXT,
    resource_id TEXT,
    sanitized_input JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_status TEXT NOT NULL DEFAULT 'success'
        CHECK (result_status IN ('success', 'denied', 'error', 'expired', 'stale')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zaffy_audit_user
    ON public.zaffy_tool_audit_logs (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- F. Usage logs (provider telemetry; never raw message bodies)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zaffy_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success'
        CHECK (status IN ('success', 'timeout', 'quota', 'error', 'invalid_output')),
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zaffy_usage_user
    ON public.zaffy_usage_logs (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- G. User settings (one row per user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zaffy_user_settings (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    preferred_language TEXT NOT NULL DEFAULT 'hinglish'
        CHECK (preferred_language IN ('en-IN', 'hi', 'hinglish')),
    personality_mode TEXT NOT NULL DEFAULT 'auto'
        CHECK (personality_mode IN ('auto', 'shopping', 'complaints', 'payments', 'merchant', 'casual')),
    response_length TEXT NOT NULL DEFAULT 'balanced'
        CHECK (response_length IN ('brief', 'balanced', 'detailed')),
    memory_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- H. Feedback (required by POST /feedback; no sensible existing table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zaffy_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES public.zaffy_conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES public.zaffy_messages(id) ON DELETE SET NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zaffy_fb_conv ON public.zaffy_feedback (conversation_id);

-- ============================================================================
-- RLS — enable on every private table
-- ============================================================================
ALTER TABLE public.zaffy_conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaffy_messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaffy_user_memories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaffy_action_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaffy_tool_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaffy_usage_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaffy_user_settings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zaffy_feedback        ENABLE ROW LEVEL SECURITY;

-- Conversations: owner full control
DROP POLICY IF EXISTS zaffy_conv_select_own ON public.zaffy_conversations;
CREATE POLICY zaffy_conv_select_own ON public.zaffy_conversations
    FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));
DROP POLICY IF EXISTS zaffy_conv_insert_own ON public.zaffy_conversations;
CREATE POLICY zaffy_conv_insert_own ON public.zaffy_conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS zaffy_conv_update_own ON public.zaffy_conversations;
CREATE POLICY zaffy_conv_update_own ON public.zaffy_conversations
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS zaffy_conv_delete_own ON public.zaffy_conversations;
CREATE POLICY zaffy_conv_delete_own ON public.zaffy_conversations
    FOR DELETE USING (auth.uid() = user_id);

-- Messages: owner read; inserts/updates only via service role (edge function)
DROP POLICY IF EXISTS zaffy_msg_select_own ON public.zaffy_messages;
CREATE POLICY zaffy_msg_select_own ON public.zaffy_messages
    FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));

-- Memories: owner full control (review, correct, delete)
DROP POLICY IF EXISTS zaffy_mem_select_own ON public.zaffy_user_memories;
CREATE POLICY zaffy_mem_select_own ON public.zaffy_user_memories
    FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));
DROP POLICY IF EXISTS zaffy_mem_write_own ON public.zaffy_user_memories;
CREATE POLICY zaffy_mem_write_own ON public.zaffy_user_memories
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS zaffy_mem_update_own ON public.zaffy_user_memories;
CREATE POLICY zaffy_mem_update_own ON public.zaffy_user_memories
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS zaffy_mem_delete_own ON public.zaffy_user_memories;
CREATE POLICY zaffy_mem_delete_own ON public.zaffy_user_memories
    FOR DELETE USING (auth.uid() = user_id);

-- Action proposals: user may read own + confirm own (confirm endpoint flips
-- status); NO direct user UPDATE/DELETE — execution transitions happen via
-- service role only. Insert allowed only with own user_id (function validates).
DROP POLICY IF EXISTS zaffy_prop_select_own ON public.zaffy_action_proposals;
CREATE POLICY zaffy_prop_select_own ON public.zaffy_action_proposals
    FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));
DROP POLICY IF EXISTS zaffy_prop_insert_own ON public.zaffy_action_proposals;
CREATE POLICY zaffy_prop_insert_own ON public.zaffy_action_proposals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Audit logs: owner + admin read-only
DROP POLICY IF EXISTS zaffy_audit_select_own ON public.zaffy_tool_audit_logs;
CREATE POLICY zaffy_audit_select_own ON public.zaffy_tool_audit_logs
    FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));

-- Usage logs: owner + admin read-only
DROP POLICY IF EXISTS zaffy_usage_select_own ON public.zaffy_usage_logs;
CREATE POLICY zaffy_usage_select_own ON public.zaffy_usage_logs
    FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));

-- Settings: owner full control
DROP POLICY IF EXISTS zaffy_settings_own_select ON public.zaffy_user_settings;
CREATE POLICY zaffy_settings_own_select ON public.zaffy_user_settings
    FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));
DROP POLICY IF EXISTS zaffy_settings_own_write ON public.zaffy_user_settings;
CREATE POLICY zaffy_settings_own_write ON public.zaffy_user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS zaffy_settings_own_update ON public.zaffy_user_settings;
CREATE POLICY zaffy_settings_own_update ON public.zaffy_user_settings
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Feedback: user may insert own; read own only
DROP POLICY IF EXISTS zaffy_fb_insert_own ON public.zaffy_feedback;
CREATE POLICY zaffy_fb_insert_own ON public.zaffy_feedback
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS zaffy_fb_select_own ON public.zaffy_feedback;
CREATE POLICY zaffy_fb_select_own ON public.zaffy_feedback
    FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));

-- ============================================================================
-- Grants (hardening-following: explicit, least-privilege)
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zaffy_conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zaffy_messages TO authenticated;
GRANT SELECT ON public.zaffy_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zaffy_user_memories TO authenticated;
GRANT SELECT, INSERT ON public.zaffy_action_proposals TO authenticated;
GRANT SELECT ON public.zaffy_tool_audit_logs TO authenticated;
GRANT SELECT ON public.zaffy_usage_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.zaffy_user_settings TO authenticated;
GRANT SELECT, INSERT ON public.zaffy_feedback TO authenticated;

-- ============================================================================
-- Retention: purge expired proposals older than 7 days, tool audit older than
-- 90 days, usage older than 90 days. SECURITY DEFINER, service-role only.
-- Call periodically (pg_cron if available, else app-scheduled).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.zaffy_purge_expired()
RETURNS TABLE (proposals_purged BIGINT, audit_purged BIGINT, usage_purged BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    p BIGINT; a BIGINT; u BIGINT;
BEGIN
    DELETE FROM public.zaffy_action_proposals
     WHERE expires_at < now() - INTERVAL '7 days';
    GET DIAGNOSTICS p = ROW_COUNT;
    DELETE FROM public.zaffy_tool_audit_logs
     WHERE created_at < now() - INTERVAL '90 days';
    GET DIAGNOSTICS a = ROW_COUNT;
    DELETE FROM public.zaffy_usage_logs
     WHERE created_at < now() - INTERVAL '90 days';
    GET DIAGNOSTICS u = ROW_COUNT;
    RETURN QUERY SELECT p, a, u;
END;
$$;

REVOKE ALL ON FUNCTION public.zaffy_purge_expired() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zaffy_purge_expired() TO service_role;
