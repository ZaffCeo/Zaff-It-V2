-- ============================================================================
-- 028_w4c_zaff_ads.sql
-- W4c (doc §ads align): Zaff Ads — sponsored placements with honest
-- review-gated serving.
--
-- Doc rules implemented:
--   A1 Merchants book sponsored placements (search keyword / category banner);
--      every booking lands in the EXISTING generic approvals queue
--      (entity_type='ad', 009_platform_backbone) — admin review required
--      before serving. No paid placement bypasses review.
--   A2 Serving: only active, in-date, approved campaigns; matching by keyword
--      for search placements. Sponsored content is always labelled ("Sponsored").
--   A3 Performance: impressions/clicks counters via record_ad_event.
--      spent_paise stays 0 until the founder fixes CPC/CPM pricing (doc has
--      none yet) — no fake spend numbers.
--   A4 Merchant sees own campaigns + aggregates (my_ad_campaigns).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    placement_type TEXT NOT NULL
        CHECK (placement_type IN ('search_keyword', 'category_banner')),
    keyword TEXT,
    headline TEXT NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review', 'active', 'paused', 'completed', 'rejected', 'cancelled')),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    days SMALLINT NOT NULL DEFAULT 7 CHECK (days BETWEEN 1 AND 30),
    budget_paise INTEGER NOT NULL CHECK (budget_paise > 0),
    spent_paise INTEGER NOT NULL DEFAULT 0 CHECK (spent_paise >= 0),
    impressions INTEGER NOT NULL DEFAULT 0 CHECK (impressions >= 0),
    clicks INTEGER NOT NULL DEFAULT 0 CHECK (clicks >= 0),
    rejection_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ad_keyword_required CHECK (
        placement_type <> 'search_keyword' OR (keyword IS NOT NULL AND char_length(trim(keyword)) > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_serving
    ON public.ad_campaigns (placement_type, keyword)
    WHERE status = 'active';

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_campaigns_select_scoped ON public.ad_campaigns;
CREATE POLICY ad_campaigns_select_scoped ON public.ad_campaigns
    FOR SELECT TO authenticated
    USING (merchant_id = auth.uid() OR is_admin());

-- 1) Merchant books a placement -> pending_review + approvals queue row --------
CREATE OR REPLACE FUNCTION public.create_ad_booking(
    p_store_id UUID,
    p_placement_type TEXT,
    p_keyword TEXT,
    p_headline TEXT,
    p_days SMALLINT,
    p_budget_paise INTEGER,
    p_product_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_campaign UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT public.is_merchant_owner_of_store(p_store_id) THEN
        RAISE EXCEPTION 'Store not owned by you';
    END IF;

    IF p_placement_type NOT IN ('search_keyword', 'category_banner') THEN
        RAISE EXCEPTION 'Invalid placement_type: %', p_placement_type;
    END IF;

    IF p_headline IS NULL OR char_length(trim(p_headline)) < 3 OR char_length(trim(p_headline)) > 80 THEN
        RAISE EXCEPTION 'Headline must be 3-80 characters';
    END IF;

    IF p_days < 1 OR p_days > 30 THEN
        RAISE EXCEPTION 'Booking length must be 1-30 days';
    END IF;

    -- Anti-abuse floor: minimum Rs100/day. Platform CPC/CPM pricing is set
    -- by the founder before launch; until then budget is a cap, spend stays 0.
    IF p_budget_paise IS NULL OR p_budget_paise < 10000 * p_days THEN
        RAISE EXCEPTION 'Budget too low: minimum Rs100 per booking day';
    END IF;

    INSERT INTO public.ad_campaigns (
        store_id, merchant_id, placement_type, keyword, headline,
        product_id, days, budget_paise
    ) VALUES (
        p_store_id, v_user_id, p_placement_type,
        CASE WHEN p_placement_type = 'search_keyword' THEN upper(trim(p_keyword)) ELSE NULL END,
        trim(p_headline),
        p_product_id,
        p_days,
        p_budget_paise
    ) RETURNING id INTO v_campaign;

    INSERT INTO public.approvals (entity_type, entity_id, requested_by, status)
    VALUES ('ad', v_campaign, v_user_id, 'pending');

    PERFORM public.record_audit_log(
        v_user_id, 'merchant', 'ads.booking_created', 'ad_campaigns', v_campaign,
        NULL,
        jsonb_build_object('placement_type', p_placement_type, 'keyword', p_keyword, 'days', p_days),
        jsonb_build_object('budget_paise', p_budget_paise)
    );

    RETURN jsonb_build_object(
        'campaign_id', v_campaign,
        'status', 'pending_review',
        'review_sla', 'Admin review pending — SLA under 90 minutes (stitch promise)'
    );
END;
$function$;

-- 2) Admin review -> active / rejected (keeps approvals queue in sync) ---------
CREATE OR REPLACE FUNCTION public.review_ad_booking(
    p_campaign_id UUID,
    p_approve BOOLEAN,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_campaign public.ad_campaigns%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    SELECT * INTO v_campaign FROM public.ad_campaigns
    WHERE id = p_campaign_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign not found';
    END IF;

    IF v_campaign.status NOT IN ('pending_review', 'paused') THEN
        RAISE EXCEPTION 'Campaign in status % cannot be reviewed', v_campaign.status;
    END IF;

    IF p_approve THEN
        UPDATE public.ad_campaigns
        SET status = 'active',
            starts_at = COALESCE(starts_at, now()),
            ends_at = COALESCE(ends_at, now() + make_interval(days => v_campaign.days)),
            rejection_note = NULL,
            updated_at = now()
        WHERE id = p_campaign_id;
    ELSE
        UPDATE public.ad_campaigns
        SET status = 'rejected',
            rejection_note = p_note,
            updated_at = now()
        WHERE id = p_campaign_id;
    END IF;

    UPDATE public.approvals
    SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
        decided_by = v_user_id,
        decided_at = now(),
        note = p_note
    WHERE entity_type = 'ad' AND entity_id = p_campaign_id AND status = 'pending';

    PERFORM public.record_audit_log(
        v_user_id, 'admin', 'ads.reviewed', 'ad_campaigns', p_campaign_id,
        jsonb_build_object('status', v_campaign.status),
        jsonb_build_object('approved', p_approve, 'note', p_note),
        '{}'::jsonb
    );

    RETURN jsonb_build_object(
        'ok', true,
        'status', CASE WHEN p_approve THEN 'active' ELSE 'rejected' END
    );
END;
$function$;

-- 3) Serving: active keyword campaigns for customer search ----------------------
CREATE OR REPLACE FUNCTION public.get_sponsored_search(p_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_rows JSONB;
BEGIN
    IF p_query IS NULL OR char_length(trim(p_query)) < 2 THEN
        RETURN '[]'::JSONB;
    END IF;

    SELECT COALESCE(jsonb_agg(row_json), '[]'::JSONB)
    INTO v_rows
    FROM (
        SELECT jsonb_build_object(
            'campaign_id', c.id,
            'headline', c.headline,
            'store_id', s.id,
            'store_name', s.name,
            'product_id', p.id,
            'product_name', p.name,
            'unit_label', p.unit_label,
            'mrp_paise', sp.mrp_paise,
            'selling_price_paise', sp.selling_price_paise,
            'available_to_sell', inv.available_to_sell
        ) AS row_json
        FROM public.ad_campaigns c
        JOIN public.stores s ON s.id = c.store_id AND s.is_active AND s.is_open
        JOIN public.store_products sp ON sp.store_id = s.id AND sp.is_available
        JOIN public.products p ON p.id = sp.product_id AND p.is_active
        JOIN public.inventory inv ON inv.store_product_id = sp.id
        WHERE c.status = 'active'
          AND c.placement_type = 'search_keyword'
          AND now() BETWEEN c.starts_at AND c.ends_at
          AND (
            c.keyword ILIKE '%' || trim(p_query) || '%'
            OR trim(p_query) ILIKE '%' || c.keyword || '%'
          )
          AND c.product_id = p.id
        ORDER BY c.clicks DESC
        LIMIT 2
    ) sub;

    RETURN v_rows;
END;
$function$;

-- 4) Impression/click counters --------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_ad_event(
    p_campaign_id UUID,
    p_event_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF p_event_type NOT IN ('impression', 'click') THEN
        RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
    END IF;

    UPDATE public.ad_campaigns
    SET impressions = impressions + CASE WHEN p_event_type = 'impression' THEN 1 ELSE 0 END,
        clicks = clicks + CASE WHEN p_event_type = 'click' THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = p_campaign_id
      AND status = 'active'
      AND now() BETWEEN starts_at AND ends_at;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'campaign_not_serving');
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 5) Merchant campaigns + aggregates --------------------------------------------
CREATE OR REPLACE FUNCTION public.my_ad_campaigns()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_rows JSONB;
    v_totals JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'placement_type', c.placement_type,
        'keyword', c.keyword,
        'headline', c.headline,
        'status', c.status,
        'days', c.days,
        'budget_paise', c.budget_paise,
        'spent_paise', c.spent_paise,
        'impressions', c.impressions,
        'clicks', c.clicks,
        'starts_at', c.starts_at,
        'ends_at', c.ends_at,
        'rejection_note', c.rejection_note,
        'store_name', s.name
    ) ORDER BY c.created_at DESC), '[]'::JSONB)
    INTO v_rows
    FROM public.ad_campaigns c
    JOIN public.stores s ON s.id = c.store_id
    WHERE c.merchant_id = v_user_id;

    SELECT jsonb_build_object(
        'campaigns', count(*),
        'active', count(*) FILTER (WHERE status = 'active'),
        'pending', count(*) FILTER (WHERE status = 'pending_review'),
        'impressions', COALESCE(sum(impressions), 0),
        'clicks', COALESCE(sum(clicks), 0)
    )
    INTO v_totals
    FROM public.ad_campaigns
    WHERE merchant_id = v_user_id;

    RETURN jsonb_build_object('campaigns', v_rows, 'totals', v_totals);
END;
$function$;

-- 6) Grants ----------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.create_ad_booking(UUID, TEXT, TEXT, TEXT, SMALLINT, INTEGER, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_ad_booking(UUID, TEXT, TEXT, TEXT, SMALLINT, INTEGER, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.review_ad_booking(UUID, BOOLEAN, TEXT) FROM public, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_sponsored_search(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_sponsored_search(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.record_ad_event(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_ad_event(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.my_ad_campaigns() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_ad_campaigns() TO authenticated;
