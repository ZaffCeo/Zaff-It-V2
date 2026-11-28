-- =============================================================================
-- ZAFF-IT V2 · 043_admin_approvals.sql
-- Wave: Admin Approvals (#3) — unified verification pipeline (doc §12)
-- Date: 2026-11-28
--
-- One queue for every earned role: seller (merchant), rider, service_provider.
-- Applicant submits (docs summary as JSONB payload — never raw ID numbers:
-- only masked last-4 / booleans / refs), Zaff office (Sagheer/Javed) reviews
-- in the admin tab, approve grants the earned role + flips merchant KYC.
-- Every step audit-logged.
--
-- Policy notes (doc §12 + DPDP §16):
--   · payload stores MASKED document refs only (e.g. govt_id_last4, booleans,
--     photo storage refs) — never full ID numbers.
--   · approve maps kind → user_roles row; seller approve also verifies the
--     merchant KYC row(s) owned by the applicant.
--   · one pending request per (user, kind); re-apply after reject is allowed.
-- =============================================================================

-- 1) Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_requests (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('seller', 'rider', 'service_provider')),
    display_name TEXT NOT NULL,
    phone        TEXT,
    payload      JSONB NOT NULL DEFAULT '{}'::JSONB,
    note         TEXT CHECK (char_length(COALESCE(note, '')) <= 500),
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
    review_note  TEXT,
    reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT verification_requests_one_pending UNIQUE (user_id, kind, status)
);

-- partial unique index: only one PENDING per (user, kind)
CREATE UNIQUE INDEX IF NOT EXISTS uq_verification_pending
    ON public.verification_requests (user_id, kind)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_verification_status_created
    ON public.verification_requests (status, created_at DESC);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'verification_requests'
                   AND policyname = 'verification_requests_select_own_or_admin') THEN
        CREATE POLICY verification_requests_select_own_or_admin
            ON public.verification_requests
            FOR SELECT TO authenticated
            USING (auth.uid() = user_id OR public.is_admin());
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                   AND tablename = 'verification_requests'
                   AND policyname = 'verification_requests_insert_own') THEN
        CREATE POLICY verification_requests_insert_own
            ON public.verification_requests
            FOR INSERT TO authenticated
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 2) Submit (applicant) -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_verification_request(
    p_kind         TEXT,
    p_display_name TEXT,
    p_phone        TEXT DEFAULT NULL,
    p_payload      JSONB DEFAULT '{}'::JSONB,
    p_note         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
    v_id   UUID;
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_kind NOT IN ('seller', 'rider', 'service_provider') THEN
        RAISE EXCEPTION 'Invalid verification kind';
    END IF;
    IF p_display_name IS NULL OR char_length(trim(p_display_name)) < 2
       OR char_length(trim(p_display_name)) > 80 THEN
        RAISE EXCEPTION 'Naam 2-80 characters ka hona chahiye';
    END IF;

    -- one pending per (user, kind)
    IF EXISTS (SELECT 1 FROM public.verification_requests
               WHERE user_id = v_user AND kind = p_kind AND status = 'pending') THEN
        RAISE EXCEPTION 'Aapki is role ki request already pending hai';
    END IF;

    -- DPDP: never store full document numbers — strip obvious keys defensively
    p_payload := p_payload - 'aadhaar' - 'aadhar' - 'govt_id_number' - 'pan';

    INSERT INTO public.verification_requests
        (user_id, kind, display_name, phone, payload, note)
    VALUES
        (v_user, p_kind, trim(p_display_name), p_phone, p_payload, p_note)
    RETURNING id INTO v_id;

    PERFORM public.record_audit_log(
        v_user, 'customer', 'verification_submitted', 'verification_requests', v_id,
        NULL, jsonb_build_object('kind', p_kind)
    );
    RETURN jsonb_build_object('ok', true, 'request_id', v_id, 'status', 'pending');
END;
$function$;

-- 3) My requests (applicant status view) --------------------------------------
CREATE OR REPLACE FUNCTION public.my_verification_requests()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user UUID := auth.uid();
BEGIN
    IF v_user IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', r.id, 'kind', r.kind, 'status', r.status,
            'review_note', r.review_note,
            'submitted_at', r.created_at, 'reviewed_at', r.reviewed_at
        ) ORDER BY r.created_at DESC)
        FROM public.verification_requests r
        WHERE r.user_id = v_user
    ), '[]'::JSONB);
END;
$function$;

-- 4) Admin list ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_verification_requests(
    p_status TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'Invalid status filter';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'id', r.id, 'kind', r.kind, 'display_name', r.display_name,
            'phone', r.phone, 'payload', r.payload, 'note', r.note,
            'status', r.status, 'review_note', r.review_note,
            'created_at', r.created_at, 'reviewed_at', r.reviewed_at
        ) ORDER BY r.created_at DESC)
        FROM public.verification_requests r
        WHERE r.status = p_status
    ), '[]'::JSONB);
END;
$function$;

-- 5) Admin decide -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_verification(
    p_request_id  UUID,
    p_decision    TEXT,
    p_review_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_admin UUID := auth.uid();
    v_req   public.verification_requests%ROWTYPE;
    v_role  TEXT;
BEGIN
    IF v_admin IS NULL OR NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;
    IF p_decision NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Decision must be approved or rejected';
    END IF;
    IF p_decision = 'rejected' AND (p_review_note IS NULL OR char_length(trim(p_review_note)) < 3) THEN
        RAISE EXCEPTION 'Reject karne ke liye wajah likhna zaroori hai';
    END IF;

    SELECT * INTO v_req FROM public.verification_requests WHERE id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;
    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'Request already reviewed (current: %)', v_req.status;
    END IF;

    UPDATE public.verification_requests
    SET status = p_decision,
        review_note = p_review_note,
        reviewed_by = v_admin,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

    IF p_decision = 'approved' THEN
        v_role := CASE v_req.kind
            WHEN 'seller' THEN 'merchant'
            WHEN 'rider' THEN 'rider'
            ELSE 'service_provider'
        END;
        INSERT INTO public.user_roles (user_id, role, is_active)
        VALUES (v_req.user_id, v_role, true)
        ON CONFLICT (user_id, role) DO UPDATE
            SET is_active = true;  -- re-approve restores a lapsed role

        -- seller approval verifies owned merchant KYC
        IF v_req.kind = 'seller' THEN
            UPDATE public.merchants
            SET kyc_status = 'verified', updated_at = now()
            WHERE owner_user_id = v_req.user_id AND kyc_status = 'pending';
        END IF;
    END IF;

    PERFORM public.record_audit_log(
        v_admin, 'admin', 'verification_decided', 'verification_requests', p_request_id,
        jsonb_build_object('status', 'pending'),
        jsonb_build_object('decision', p_decision, 'kind', v_req.kind)
    );
    RETURN jsonb_build_object('ok', true, 'decision', p_decision,
                              'role_granted', CASE WHEN p_decision = 'approved'
                                THEN (CASE v_req.kind WHEN 'seller' THEN 'merchant'
                                      WHEN 'rider' THEN 'rider' ELSE 'service_provider' END)
                                ELSE NULL END);
END;
$function$;

-- 6) Grants -------------------------------------------------------------------
REVOKE ALL ON public.verification_requests FROM anon, authenticated;
GRANT SELECT, INSERT ON public.verification_requests TO authenticated;

REVOKE ALL ON FUNCTION public.submit_verification_request(TEXT, TEXT, TEXT, JSONB, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_verification_request(TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.my_verification_requests() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_verification_requests() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_verification_requests(TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_verification_requests(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_decide_verification(UUID, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_verification(UUID, TEXT, TEXT) TO authenticated;

-- =============================================================================
-- ROLLBACK (exact, reverse order):
--   REVOKE EXECUTE ON FUNCTION public.admin_decide_verification(UUID, TEXT, TEXT) FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION public.admin_list_verification_requests(TEXT) FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION public.my_verification_requests() FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION public.submit_verification_request(TEXT, TEXT, TEXT, JSONB, TEXT) FROM authenticated;
--   REVOKE SELECT, INSERT ON public.verification_requests FROM authenticated;
--   DROP FUNCTION public.admin_decide_verification(UUID, TEXT, TEXT);
--   DROP FUNCTION public.admin_list_verification_requests(TEXT);
--   DROP FUNCTION public.my_verification_requests();
--   DROP FUNCTION public.submit_verification_request(TEXT, TEXT, TEXT, JSONB, TEXT);
--   DROP TABLE public.verification_requests;
-- =============================================================================
