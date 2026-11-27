-- ============================================================================
-- 018_zaff_fresh_godown.sql
-- Zaff Fresh — founder's own fruits godown (own supply, dark-store fulfilment).
--   • Category: Fruits & Veggies
--   • Store:    Zaff Fresh — Apna Fruits Godown (Makrana Central zone)
--   • Products: 8 fruits with hi_name (kela/seb/anar/papita/angoor/santra/
--               amrud/tarbooz) so synonym-aware search_products hits them
--   • store_products + inventory (stock quantities are opening counts —
--               founder updates via merchant/inventory flow as supply lands)
-- Idempotent. Already applied live via SQL editor (same statements).
-- ============================================================================

insert into public.categories (id, name, slug)
values ('44444444-4444-4444-8444-444444444406', 'Fruits & Veggies', 'fruits-veggies')
on conflict (id) do nothing;

insert into public.stores (
  merchant_id, service_zone_id, name, slug, fulfillment_type,
  address_line1, city, state, pincode, lat, lng, phone,
  is_open, prep_time_minutes, min_order_paise, is_active
)
select m.id, '11111111-1111-4111-8111-111111111101',
  'Zaff Fresh — Apna Fruits Godown', 'zaff-fresh-godown', 'dark_store',
  'Zaff Fresh Godown, Fruit Mandi Road, Near Krishi Upaj Mandi',
  'Makrana', 'Rajasthan', '341505', 27.0378, 74.7250,
  coalesce(m.phone, '9000000001'), true, 15, 4900, true
from public.merchants m limit 1
on conflict (slug) do nothing;

insert into public.products (id, category_id, sku, slug, name, brand, description, unit_label, hi_name, is_veg, is_active, verification_status)
values
  ('55555555-5555-4555-8555-555555555601','44444444-4444-4444-8444-444444444406','ZAF-FRUIT-001','zaff-fresh-robusta-banana-12pc','Zaff Fresh Robusta Banana','Zaff Fresh','Zaff Fresh godown direct supply — mandi se seedha, daily fresh stock','12 pcs','kela',true,true,'verified'),
  ('55555555-5555-4555-8555-555555555602','44444444-4444-4444-8444-444444444406','ZAF-FRUIT-002','zaff-fresh-shimla-apple-1kg','Zaff Fresh Shimla Apple','Zaff Fresh','Zaff Fresh godown direct supply — crisp Shimla apples','1 kg','seb',true,true,'verified'),
  ('55555555-5555-4555-8555-555555555603','44444444-4444-4444-8444-444444444406','ZAF-FRUIT-003','zaff-fresh-pomegranate-500g','Zaff Fresh Pomegranate (Anar)','Zaff Fresh','Zaff Fresh godown direct supply — sweet red grains','500 g','anar',true,true,'verified'),
  ('55555555-5555-4555-8555-555555555604','44444444-4444-4444-8444-444444444406','ZAF-FRUIT-004','zaff-fresh-papaya-1kg','Zaff Fresh Papaya (Papita)','Zaff Fresh','Zaff Fresh godown direct supply — farm ripened','1 kg','papita',true,true,'verified'),
  ('55555555-5555-4555-8555-555555555605','44444444-4444-4444-8444-444444444406','ZAF-FRUIT-005','zaff-fresh-green-grapes-500g','Zaff Fresh Green Grapes (Angoor)','Zaff Fresh','Zaff Fresh godown direct supply — seedless, sweet','500 g','angoor',true,true,'verified'),
  ('55555555-5555-4555-8555-555555555606','44444444-4444-4444-8444-444444444406','ZAF-FRUIT-006','zaff-fresh-nagpur-orange-1kg','Zaff Fresh Nagpur Orange (Santra)','Zaff Fresh','Zaff Fresh godown direct supply — juicy nagpur oranges','1 kg','santra',true,true,'verified'),
  ('55555555-5555-4555-8555-555555555607','44444444-4444-4444-8444-444444444406','ZAF-FRUIT-007','zaff-fresh-guava-500g','Zaff Fresh Guava (Amrud)','Zaff Fresh','Zaff Fresh godown direct supply — local Makrana mandi guava','500 g','amrud',true,true,'verified'),
  ('55555555-5555-4555-8555-555555555608','44444444-4444-4444-8444-444444444406','ZAF-FRUIT-008','zaff-fresh-watermelon-2kg','Zaff Fresh Watermelon (Tarbooz)','Zaff Fresh','Zaff Fresh godown direct supply — summer sweet, farm cut','~2 kg','tarbooz',true,true,'verified')
on conflict (id) do nothing;

insert into public.store_products (store_id, product_id, mrp_paise, selling_price_paise, max_qty_per_order, is_available)
select s.id, p.id, v.mrp, v.sell, 10, true
from public.stores s
join (values
  ('zaff-fresh-robusta-banana-12pc',5500,4500),
  ('zaff-fresh-shimla-apple-1kg',18000,14900),
  ('zaff-fresh-pomegranate-500g',12000,9900),
  ('zaff-fresh-papaya-1kg',6000,4900),
  ('zaff-fresh-green-grapes-500g',9000,7500),
  ('zaff-fresh-nagpur-orange-1kg',8000,6500),
  ('zaff-fresh-guava-500g',5000,3900),
  ('zaff-fresh-watermelon-2kg',7000,5500)
) as v(slug, mrp, sell) on true
join public.products p on p.slug = v.slug
where s.slug = 'zaff-fresh-godown'
  and not exists (select 1 from public.store_products sp where sp.store_id = s.id and sp.product_id = p.id);

-- NOTE: available_to_sell is GENERATED — insert on_hand/reserved only.
insert into public.inventory (store_product_id, store_id, on_hand_qty, reserved_qty, low_stock_threshold)
select sp.id, sp.store_id, v.qty, 0, 8
from public.store_products sp
join public.stores s on s.id = sp.store_id
join (values
  ('zaff-fresh-robusta-banana-12pc',120),
  ('zaff-fresh-shimla-apple-1kg',80),
  ('zaff-fresh-pomegranate-500g',60),
  ('zaff-fresh-papaya-1kg',50),
  ('zaff-fresh-green-grapes-500g',45),
  ('zaff-fresh-nagpur-orange-1kg',90),
  ('zaff-fresh-guava-500g',55),
  ('zaff-fresh-watermelon-2kg',40)
) as v(slug, qty) on true
join public.products p on p.id = sp.product_id and p.slug = v.slug
where s.slug = 'zaff-fresh-godown'
  and not exists (select 1 from public.inventory inv where inv.store_product_id = sp.id);
