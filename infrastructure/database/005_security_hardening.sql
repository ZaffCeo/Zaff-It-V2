-- =============================================================================
-- ZAFF-IT 005 — SECURITY HARDENING (Post-audit remediation)
-- Audit date: 2026-11-26 · Ref: docs/security/SECURITY_AUDIT_REPORT.md
--
-- Fixes:
--   AUD-CRIT-1  Rider could UPDATE delivery_tasks directly via PostgREST
--               (set status='delivered', overwrite OTPs) bypassing the
--               order-lifecycle OTP verification.
--   AUD-HIGH-2  Rider row-SELECT exposed plaintext pickup_otp / delivery_otp
--               (OTP proof-of-delivery defeated: rider could read the OTP).
-- Fix approach:
--   * Move both OTPs out of delivery_tasks into a dedicated table with RLS
--     ENABLED and ZERO policies (deny-by-default; only service-role Edge
--     Functions and SECURITY DEFINER RPC can touch it).
--   * Drop the rider UPDATE policy entirely — task status transitions now
--     happen ONLY through the order-lifecycle Edge Function (service role,
--     with state-machine + OTP verification + audit logging).
--   * Expose delivery OTP to the order's CUSTOMER via a SECURITY DEFINER RPC
--     `get_my_delivery_otp` (customer tells the rider the OTP — rider never
--     sees it).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Dedicated handover-OTP vault (deny-by-default RLS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_handover_otps (
    task_id         UUID PRIMARY KEY REFERENCES public.delivery_tasks(id) ON DELETE CASCADE,
    pickup_otp      TEXT NOT NULL,
    delivery_otp    TEXT NOT NULL,
    failed_attempts INT  NOT NULL DEFAULT 0,
    locked          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.delivery_handover_otps ENABLE ROW LEVEL SECURITY;

-- Intentionally NO policies: authenticated clients are denied; the service
-- role (Edge Functions) bypasses RLS by design.
COMMENT ON TABLE public.delivery_handover_otps IS
  'Plaintext handover OTPs. RLS deny-all: readable only by service-role functions and get_my_delivery_otp RPC.';

-- ---------------------------------------------------------------------------
-- 2. Remove OTP columns from delivery_tasks (no legacy deployments yet)
-- ---------------------------------------------------------------------------
ALTER TABLE public.delivery_tasks DROP COLUMN IF EXISTS pickup_otp;
ALTER TABLE public.delivery_tasks DROP COLUMN IF EXISTS delivery_otp;

-- ---------------------------------------------------------------------------
-- 3. Remove rider direct-update policy (CRIT-1)
--    Status transitions must go through order-lifecycle Edge Function only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS delivery_tasks_rider_or_admin_update ON public.delivery_tasks;

CREATE POLICY delivery_tasks_admin_update ON public.delivery_tasks
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Customer-only delivery OTP disclosure (replaces direct column read)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_delivery_otp(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_customer UUID;
    v_otp TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT customer_id INTO v_customer
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND OR v_customer <> auth.uid() THEN
        RAISE EXCEPTION 'Order not found for current user';
    END IF;

    SELECT h.delivery_otp INTO v_otp
    FROM public.delivery_handover_otps h
    JOIN public.delivery_tasks dt ON dt.id = h.task_id
    WHERE dt.order_id = p_order_id;

    RETURN v_otp;  -- NULL when no rider assigned yet (no OTP generated)
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_delivery_otp(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_delivery_otp(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Audit the hardening change itself
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.audit_logs LIMIT 1) OR TRUE THEN
        INSERT INTO public.audit_logs (actor_role, action, entity_type, entity_id, details)
        VALUES (
            'system',
            'SECURITY_HARDENING_005',
            'delivery_tasks',
            NULL,
            '{"change": "OTPs moved to delivery_handover_otps (deny-all RLS); rider UPDATE policy removed; customer OTP via get_my_delivery_otp RPC"}'::JSONB
        );
    END IF;
END
$$;
