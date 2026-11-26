-- ============================================================================
-- 014_e2e_fixes.sql
-- Fixes discovered by the first end-to-end production order test
-- (order ZAF-20261126-AA613E, COD ₹74, full lifecycle delivered 2026-11-26).
--
-- Run each statement against the production database (already applied there).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Auto-create a profile for every new auth user.
--    Without this, brand-new users hit FK failures on addresses/orders
--    (profiles stayed empty; first signup-dependent insert failed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.phone, new.email, 'User'), '@', 1)),
    new.phone,
    new.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. carts: unique (user_id, store_id) — checkout-create-order upserts with
--    onConflict 'user_id,store_id'; without the constraint the upsert 400s.
-- ---------------------------------------------------------------------------
ALTER TABLE public.carts
  ADD CONSTRAINT carts_user_store_uq UNIQUE (user_id, store_id);

-- ---------------------------------------------------------------------------
-- 3. user_roles: unique (user_id, role) — role upserts (qa-auth-bridge and
--    future role flows) rely on this conflict target.
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_role_uq UNIQUE (user_id, role);

-- ---------------------------------------------------------------------------
-- 4. Settle inventory when an order is delivered.
--    create_checkout_order reserves stock and cancel releases it, but nothing
--    deducted on_hand on delivery (reserved stock leaked forever). The trigger
--    makes settlement engine-independent (any code path marking delivered).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_delivered_order_inventory(p_order_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_inv RECORD;
  v_deducted INTEGER := 0;
BEGIN
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
END $$;

CREATE OR REPLACE FUNCTION public.trg_settle_on_delivered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN
    PERFORM public.settle_delivered_order_inventory(NEW.id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_settle_on_delivered ON public.orders;
CREATE TRIGGER trg_settle_on_delivered
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered')
  EXECUTE FUNCTION public.trg_settle_on_delivered();

-- ---------------------------------------------------------------------------
-- 5. Data fix (re-runnable): seed merchant rows ship with owner_user_id NULL,
--    which makes every merchant-branch lifecycle action 403. Assign owners to
--    store 301/202 merchants here when real merchant users exist. The E2E run
--    bound QA merchant user b55b4729-4a6b-489d-8020-78208038acd5 to merchant
--    22222222-2222-4222-8222-222222222201 (store …3301) in production.
-- ---------------------------------------------------------------------------
