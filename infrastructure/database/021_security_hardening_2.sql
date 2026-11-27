-- ============================================================================
-- 021_security_hardening_2.sql
-- Post-audit hardening (2026-11-27 full-scope security mission, Phase 2).
--
-- S-01 (HIGH, CONFIRMED via live anon repro):
--   settle_delivered_order_inventory(uuid) was SECURITY DEFINER with EXECUTE
--   granted to PUBLIC+anon, no auth guard, no order-status guard, and NO
--   idempotency: a repeated call re-deducted on_hand (ELSE branch), enabling
--   stock corruption by any anonymous caller holding any order uuid.
--   FIX (non-destructive): revoke anon/public EXECUTE (authenticated stays —
--   the delivered trigger fires in rider's session), add status='delivered'
--   guard and an inventory_movements idempotency guard. Trigger fn
--   trg_settle_on_delivered also revoked from anon/public (trigger-only).
--
-- S-02 (MEDIUM, CONFIRMED via storage policy/bucket inspection):
--   product-images bucket had NO size limit and NO MIME restriction; any
--   authenticated user could upload arbitrary files (public bucket) — abuse
--   as free hosting. FIX: 5 MB limit + image MIME allowlist. Reads stay
--   public (product images are public by design).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- S-01 fixes
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.settle_delivered_order_inventory(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.trg_settle_on_delivered() FROM PUBLIC, anon;
-- authenticated + service_role keep access (trigger runs in rider's session).

CREATE OR REPLACE FUNCTION public.settle_delivered_order_inventory(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_status TEXT;
    v_row RECORD;
    v_inv RECORD;
    v_deducted INTEGER := 0;
BEGIN
    -- Guard 1: order must exist AND be delivered (blocks premature/forge settles)
    SELECT status INTO v_status FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order_not_found';
    END IF;
    IF v_status <> 'delivered' THEN
        RAISE EXCEPTION 'order_not_delivered';
    END IF;

    -- Guard 2: idempotency — never settle the same order twice
    IF EXISTS (
        SELECT 1 FROM public.inventory_movements
        WHERE order_id = p_order_id AND reason = 'order delivered'
    ) THEN
        RETURN jsonb_build_object('order_id', p_order_id, 'units_settled', 0, 'already_settled', true);
    END IF;

    FOR v_row IN
        SELECT oi.store_product_id, oi.qty AS quantity
        FROM public.order_items oi
        WHERE oi.order_id = p_order_id
    LOOP
        SELECT * INTO v_inv FROM public.inventory
          WHERE store_product_id = v_row.store_product_id
          FOR UPDATE;
        IF v_inv.id IS NULL THEN
            CONTINUE;
        END IF;
        IF v_inv.reserved_qty >= v_row.quantity THEN
            UPDATE public.inventory
              SET on_hand_qty = on_hand_qty - v_row.quantity,
                  reserved_qty = reserved_qty - v_row.quantity,
                  updated_at = now()
              WHERE id = v_inv.id;
        ELSE
            UPDATE public.inventory
              SET on_hand_qty = GREATEST(0, on_hand_qty - v_row.quantity),
                  reserved_qty = 0,
                  updated_at = now()
              WHERE id = v_inv.id;
        END IF;
        INSERT INTO public.inventory_movements
          (inventory_id, store_product_id, order_id, movement_type, qty_delta, on_hand_after, reserved_after, reason, actor_id)
        VALUES
          (v_inv.id, v_row.store_product_id, p_order_id, 'deduct', -v_row.quantity,
           GREATEST(0, v_inv.on_hand_qty - v_row.quantity),
           CASE WHEN v_inv.reserved_qty >= v_row.quantity THEN v_inv.reserved_qty - v_row.quantity ELSE 0 END,
           'order delivered', NULL);
        v_deducted := v_deducted + v_row.quantity;
    END LOOP;

    RETURN jsonb_build_object('order_id', p_order_id, 'units_settled', v_deducted);
END
$function$;

-- ---------------------------------------------------------------------------
-- S-02 fixes: storage abuse limits (non-destructive; read stays public)
-- ---------------------------------------------------------------------------
UPDATE storage.buckets
   SET file_size_limit = 5242880, -- 5 MB
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
 WHERE id = 'product-images';
