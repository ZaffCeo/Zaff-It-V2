-- ZAFF-IT Strict Row Level Security (RLS) Policies
-- Roles: customer, merchant, rider, admin
-- Rule: NEVER use USING (true) for writes or sensitive reads.

SET timezone = 'UTC';

-- ============================================================================
-- 1. SECURITY DEFINER ROLE & OWNERSHIP HELPERS (NO RECURSION)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role = p_role
          AND ur.is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT public.has_role('admin');
$$;

CREATE OR REPLACE FUNCTION public.is_merchant_owner_of_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.stores s
        JOIN public.merchants m ON m.id = s.merchant_id
        WHERE s.id = p_store_id
          AND m.owner_user_id = auth.uid()
          AND m.is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_rider_for_order(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.delivery_tasks dt
        WHERE dt.order_id = p_order_id
          AND dt.rider_id = auth.uid()
    );
$$;

-- ============================================================================
-- 2. ENABLE RLS ON ALL PUBLIC TABLES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. PROFILES, ROLES & ADDRESSES
-- ============================================================================

CREATE POLICY profiles_select_own_or_admin ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_insert_own ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_own_or_admin ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_admin())
    WITH CHECK (id = auth.uid() OR public.is_admin());

CREATE POLICY user_roles_select_own_or_admin ON public.user_roles
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY user_roles_admin_write ON public.user_roles
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY addresses_select_own_or_admin ON public.addresses
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY addresses_insert_own ON public.addresses
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY addresses_update_own ON public.addresses
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY addresses_delete_own ON public.addresses
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- ============================================================================
-- 4. ZONES, MERCHANTS & STORES
-- ============================================================================

CREATE POLICY service_zones_read_active ON public.service_zones
    FOR SELECT TO anon, authenticated
    USING (is_active = true OR public.is_admin());

CREATE POLICY service_zones_admin_write ON public.service_zones
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY merchants_select_owner_or_admin ON public.merchants
    FOR SELECT TO authenticated
    USING (owner_user_id = auth.uid() OR public.is_admin());

CREATE POLICY merchants_update_owner_or_admin ON public.merchants
    FOR UPDATE TO authenticated
    USING (owner_user_id = auth.uid() OR public.is_admin())
    WITH CHECK (owner_user_id = auth.uid() OR public.is_admin());

CREATE POLICY merchants_admin_insert_delete ON public.merchants
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY merchants_admin_delete ON public.merchants
    FOR DELETE TO authenticated
    USING (public.is_admin());

CREATE POLICY stores_read_active_or_owner ON public.stores
    FOR SELECT TO anon, authenticated
    USING (
        is_active = true
        OR public.is_merchant_owner_of_store(id)
        OR public.is_admin()
    );

CREATE POLICY stores_owner_or_admin_update ON public.stores
    FOR UPDATE TO authenticated
    USING (public.is_merchant_owner_of_store(id) OR public.is_admin())
    WITH CHECK (public.is_merchant_owner_of_store(id) OR public.is_admin());

CREATE POLICY stores_admin_insert_delete ON public.stores
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY stores_admin_delete ON public.stores
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- ============================================================================
-- 5. CATALOG, STORE PRODUCTS & INVENTORY
-- ============================================================================

CREATE POLICY categories_read_active ON public.categories
    FOR SELECT TO anon, authenticated
    USING (is_active = true OR public.is_admin());

CREATE POLICY categories_admin_write ON public.categories
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY products_read_active ON public.products
    FOR SELECT TO anon, authenticated
    USING (is_active = true OR public.is_admin());

CREATE POLICY products_admin_write ON public.products
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY store_products_read_active ON public.store_products
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.stores s
            WHERE s.id = store_products.store_id
              AND s.is_active = true
        )
        OR public.is_merchant_owner_of_store(store_id)
        OR public.is_admin()
    );

CREATE POLICY store_products_merchant_or_admin_write ON public.store_products
    FOR ALL TO authenticated
    USING (public.is_merchant_owner_of_store(store_id) OR public.is_admin())
    WITH CHECK (public.is_merchant_owner_of_store(store_id) OR public.is_admin());

CREATE POLICY inventory_read_active_store ON public.inventory
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.stores s
            WHERE s.id = inventory.store_id
              AND s.is_active = true
        )
        OR public.is_merchant_owner_of_store(store_id)
        OR public.is_admin()
    );

CREATE POLICY inventory_merchant_or_admin_update ON public.inventory
    FOR UPDATE TO authenticated
    USING (public.is_merchant_owner_of_store(store_id) OR public.is_admin())
    WITH CHECK (public.is_merchant_owner_of_store(store_id) OR public.is_admin());

CREATE POLICY inventory_admin_insert ON public.inventory
    FOR INSERT TO authenticated
    WITH CHECK (public.is_merchant_owner_of_store(store_id) OR public.is_admin());

CREATE POLICY inventory_movements_select_merchant_or_admin ON public.inventory_movements
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.inventory inv
            WHERE inv.id = inventory_movements.inventory_id
              AND public.is_merchant_owner_of_store(inv.store_id)
        )
        OR public.is_admin()
    );

-- ============================================================================
-- 6. CARTS & CART ITEMS (CUSTOMER-SCOPED)
-- ============================================================================

CREATE POLICY carts_select_own ON public.carts
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY carts_insert_own ON public.carts
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY carts_update_own ON public.carts
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY carts_delete_own ON public.carts
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY cart_items_all_own ON public.cart_items
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.carts c
            WHERE c.id = cart_items.cart_id
              AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.carts c
            WHERE c.id = cart_items.cart_id
              AND c.user_id = auth.uid()
              AND c.status = 'active'
        )
    );

-- ============================================================================
-- 7. ORDERS & ORDER ITEMS (MUTATIONS VIA ATOMIC RPCs ONLY FOR CUSTOMERS)
-- ============================================================================

CREATE POLICY orders_select_scoped ON public.orders
    FOR SELECT TO authenticated
    USING (
        customer_id = auth.uid()
        OR public.is_merchant_owner_of_store(store_id)
        OR public.is_rider_for_order(id)
        OR public.is_admin()
    );

CREATE POLICY orders_merchant_or_admin_update ON public.orders
    FOR UPDATE TO authenticated
    USING (
        public.is_merchant_owner_of_store(store_id)
        OR public.is_admin()
    )
    WITH CHECK (
        public.is_merchant_owner_of_store(store_id)
        OR public.is_admin()
    );

CREATE POLICY order_items_select_scoped ON public.order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND (
                  o.customer_id = auth.uid()
                  OR public.is_merchant_owner_of_store(o.store_id)
                  OR public.is_rider_for_order(o.id)
                  OR public.is_admin()
              )
        )
    );

-- ============================================================================
-- 8. PAYMENTS, REFUNDS & SETTLEMENT LEDGER
-- ============================================================================

CREATE POLICY payments_select_scoped ON public.payments
    FOR SELECT TO authenticated
    USING (
        customer_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = payments.order_id
              AND public.is_merchant_owner_of_store(o.store_id)
        )
        OR public.is_admin()
    );

CREATE POLICY payments_admin_update ON public.payments
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY refunds_select_scoped ON public.refunds
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = refunds.order_id
              AND (
                  o.customer_id = auth.uid()
                  OR public.is_merchant_owner_of_store(o.store_id)
              )
        )
        OR public.is_admin()
    );

CREATE POLICY refunds_admin_write ON public.refunds
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY settlement_ledger_select_merchant_or_admin ON public.settlement_ledger
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.merchants m
            WHERE m.id = settlement_ledger.merchant_id
              AND m.owner_user_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY settlement_ledger_admin_write ON public.settlement_ledger
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ============================================================================
-- 9. DELIVERY TASKS & RIDER LOCATIONS
-- ============================================================================

CREATE POLICY delivery_tasks_select_scoped ON public.delivery_tasks
    FOR SELECT TO authenticated
    USING (
        rider_id = auth.uid()
        OR public.is_merchant_owner_of_store(store_id)
        OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = delivery_tasks.order_id
              AND o.customer_id = auth.uid()
        )
        OR public.is_admin()
    );

CREATE POLICY delivery_tasks_rider_or_admin_update ON public.delivery_tasks
    FOR UPDATE TO authenticated
    USING (
        (rider_id = auth.uid() AND public.has_role('rider'))
        OR public.is_admin()
    )
    WITH CHECK (
        (rider_id = auth.uid() AND public.has_role('rider'))
        OR public.is_admin()
    );

CREATE POLICY delivery_tasks_admin_insert ON public.delivery_tasks
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY rider_locations_insert_own_rider ON public.rider_locations
    FOR INSERT TO authenticated
    WITH CHECK (rider_id = auth.uid() AND public.has_role('rider'));

CREATE POLICY rider_locations_select_scoped ON public.rider_locations
    FOR SELECT TO authenticated
    USING (
        rider_id = auth.uid()
        OR public.is_admin()
        OR EXISTS (
            SELECT 1
            FROM public.delivery_tasks dt
            JOIN public.orders o ON o.id = dt.order_id
            WHERE dt.id = rider_locations.delivery_task_id
              AND o.customer_id = auth.uid()
              AND o.status IN ('rider_assigned', 'picked_up', 'out_for_delivery')
        )
    );

-- ============================================================================
-- 10. PROMOTIONS, SUPPORT TICKETS, AUDIT LOGS & FEATURE FLAGS
-- ============================================================================

CREATE POLICY promotions_read_active ON public.promotions
    FOR SELECT TO authenticated
    USING (
        (is_active = true AND now() BETWEEN starts_at AND ends_at)
        OR public.is_admin()
    );

CREATE POLICY promotions_admin_write ON public.promotions
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY support_tickets_select_own_or_admin ON public.support_tickets
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY support_tickets_insert_own ON public.support_tickets
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY support_tickets_update_own_or_admin ON public.support_tickets
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY audit_logs_admin_select_only ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

CREATE POLICY feature_flags_read_authenticated ON public.feature_flags
    FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY feature_flags_admin_write ON public.feature_flags
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
