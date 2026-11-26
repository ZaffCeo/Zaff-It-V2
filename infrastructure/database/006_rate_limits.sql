-- ============================================================
-- ZAFF-IT 006 — PERSISTENT RATE LIMITING + RLS FORCE (SECURITY)
-- Companion to 005_security_hardening.sql. Run AFTER 005.
-- Report: docs/security/SECURITY_AUDIT_REPORT.md
-- ============================================================
--
-- WHY: Edge Functions are horizontally scaled — in-memory rate
-- limiters are per-isolate and reset on every deploy/restart.
-- This layer makes limits persistent + shared across instances.
--
-- 1. rate_limit_events — sliding-window event log (deny-all RLS)
-- 2. check_rate_limit(key, max, window_sec) — atomic RPC,
--    SECURITY DEFINER, granted ONLY to service_role + authenticated
-- 3. FORCE ROW LEVEL SECURITY on sensitive tables (owner too is
--    subject to RLS — defense-in-depth; NOTE: SQL-editor sessions
--    running as table owner will see zero rows on these tables
--    unless operating through policies/service_role contexts)

-- ------------------------------------------------------------
-- 1. Rate-limit event store
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
    key          TEXT        NOT NULL,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rate_limit_events_key_idx
    ON public.rate_limit_events (key, window_start DESC);

ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rate_limit_events IS
  'SECURITY_006: persistent sliding-window rate-limit events. No policies = deny-all. Accessed only via check_rate_limit SECURITY DEFINER RPC.';

-- ------------------------------------------------------------
-- 2. Atomic rate-limit check RPC
--    Returns TRUE = allowed (event recorded), FALSE = exceeded.
--    Key format guard + full-window GC on every call.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key         TEXT,
    p_max         INTEGER,
    p_window_sec  INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cnt INTEGER;
BEGIN
    -- key hygiene: hard cap length/charset (prevents key-space abuse)
    IF p_key IS NULL OR p_key !~ '^[a-zA-Z0-9:_-]{1,120}$' THEN
        RETURN FALSE;
    END IF;
    IF p_max IS NULL OR p_max < 1 OR p_max > 10000
       OR p_window_sec IS NULL OR p_window_sec < 1 OR p_window_sec > 86400 THEN
        RETURN FALSE;
    END IF;

    -- GC: drop events older than the window
    DELETE FROM public.rate_limit_events
    WHERE window_start < NOW() - make_interval(secs => p_window_sec);

    SELECT COUNT(*) INTO v_cnt
    FROM public.rate_limit_events
    WHERE key = p_key;

    IF v_cnt >= p_max THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.rate_limit_events (key, window_start)
    VALUES (p_key, NOW());

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role, authenticated;

-- ------------------------------------------------------------
-- 3. FORCE ROW LEVEL SECURITY on sensitive tables
--    (locks the table-owner bypass; service_role keeps its
--    platform-level BYPASSRLS so Edge Functions still work)
-- ------------------------------------------------------------
ALTER TABLE public.delivery_handover_otps FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payments              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_ledger     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_events     FORCE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4. Audit log entry
-- ------------------------------------------------------------
INSERT INTO public.audit_logs (action, entity_type, entity_id, new_data)
VALUES (
    'SECURITY_HARDENING_006',
    'system',
    NULL,
    '{"change": "Persistent rate-limit store + check_rate_limit RPC (service_role+authenticated only); FORCE RLS on vault/payments/settlement/audit/rate-limit tables"}'::JSONB
);
