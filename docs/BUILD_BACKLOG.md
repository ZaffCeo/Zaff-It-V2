# Zaff-It V2 — Build Backlog (Founder's "one-by-one" list)
**Date:** 2026-11-28 · Full-repo-scan ke baad · Source of truth for what remains.
**Rule going forward:** har feature Stitch UI + Google Drive master doc ke hisaab se banega (screens pehle map, phir code).

## Repo scan verdict (2026-11-28)
- Git clean: 199 tracked files, 0 TODO/FIXME, 0 console.log, CI green (mobile tsc + deno edge checks)
- Fixed: root `npm run typecheck` script (tsc -p apps/mobile), 9.4MB redundant brand-references untracked (Drive + app assets me same images hain)
- Vercel dormant (vercel.json off) · Hosting: Cloudflare Workers `zaff-it-v2` (runbook: docs/DEPLOY_CLOUDFLARE.md)

---

## 🔥 NOW — backend ready ya high-value (is order me, one-by-one)

### 1. Laundry booking UI (customer) — ✅ IMPLEMENTED (2026-11-28)
- **Delivered:** per-piece pricing migration 036 (founder rates: pair ₹40 / single ₹20 / press ₹10 / saree ₹40 / bedsheet ₹40 / blanket ₹80, no minimum) + `LaundryScreen` (booking + "Meri Laundry" list + cancel) + RootNavigator route + Home rail & Profile tiles wired. Live E2E pass (server-side pricing, cancel, invalid-item guard). Demo pending order ₹120 left for founder view.
- **NOT yet:** rider laundry pickup/return tasks UI, admin laundry status ladder UI (RPCs live), Zaffy/home deep-links. → merge into W-A3 rider/admin pass.

### 2. Service marketplace UI (customer + provider)
- **DB:** 100% LIVE (033: create_service_request, submit/accept_service_quote, open_service_requests, 6 categories, provider role)
- **Stitch:** request_it_bidding_quotes, request_it_runner_quotation_approval, request_it_procurement, zaff_pros_local_karigar_service_hub, mohammad_rafiq_ac_specialist_profile (pro profile), book_karigar_instant_schedule_area_flow
- **Effort:** 1 din. Screens: request form → quotes list (accept) → provider hub (open jobs + quote form). Accept pe "payment escrow coming soon" honest note (escrow deferred).

### 3. Admin Approvals tab (real UI)
- **DB:** LIVE (approvals table + review RPCs — ads wave se proven)
- **Stitch:** admin_ad_inventory_approval_console, operations_hub
- **Effort:** ½ din. Pending approvals list (ads/KYC/catalog) + approve/reject actions.

### 4. Returns & Disputes flow (customer ↔ merchant ↔ admin)
- **DB:** `disputes` table EXISTS; replacement/refund RPCs chhote add honge
- **Stitch:** return_replacement_order_zf_84291, raise_merchant_dispute_ret_84291, dispute_resolved_store_cleared, replacement_live_rider_swap_tracking, swap_success_fresh_order_receipt, merchant_damaged_pack_replacement_return, cancellation_instant_upi_refund_receipt
- **Effort:** 1–1½ din. Order detail se "Return/Replace" → photo note → status tracking → refund receipt.

## 🟡 NEXT

### 5. Merchant Store editing (timings/prep/min-order/GST)
- Stitch: merchant_store_timings_operating_schedule, merchant_setup_dukan_kyc_gst_step_3_of_3 · DB: stores/merchants UPDATE policies live · ½ din

### 6. Invoice / tax bill viewer (PDF-style slip + share)
- Stitch: tax_invoice_digital_bill_slip_zf_84291, invoice_pdf_viewer_zf_84291, customer_order_history_past_bills · DB: orders/order_items/payments LIVE · ½ din

### 7. Z-Coins tier status + unlock celebrations
- Stitch: z_coins_level_tier_status (3 variants), gold_ust_d_tier_unlock_celebration, kohinoor_legend_level_4_perks_roadmap, z_coins_passbook_ledger · DB: wallet_ledger + referral tiers LIVE · ½ din

### 8. Zaff VIP Concierge / FastPass surface
- Stitch: zaff_vip_concierge_fast_pass, zaff_vip_benefits_giveaways · DB: pro_memberships reuse · ½ din

### 9. Rider SOS + backup-rider handover
- Stitch: rider_emergency_sos_breakdown_re_dispatch_zaff_it, backup_rider_emergency_handover_bag_pickup · DB: delivery_tasks re-assign RPC chhota add · 1 din

### 10. Push notifications (expo-notifications)
- DB: notifications table LIVE · token registration + order-status push · 1 din

## 🟢 LATER (naye DB scopes — Stitch-heavy)

### 11. Group / Mohalla Orders (~10 Stitch screens)
customer_group_order_shared_cart, mohalla_group_order_* (4), group_cart_locked_* (2), merchant_group_order_packing, batch_live_customer_broadcast · naye tables (group_carts, group_members) · 2–3 din

### 12. ZAFF Move — freight/marble logistics hub (~6 screens)
zaff_move_local_transport_logistics_hub, marble_heavy_cargo_booking, hydra_crane_hourly_rental_rate_card, heavy_trailer_rate_card, marble_mandi_heavy_machinery, send_parcel_urgent_dawa_spares, courier_parcel_dukan_tiffin · freight bookings tables · 2 din

### 13. Print & Xerox flow
document_print_xerox_flow, live_print_tracking_otp, al_madina_print_terminal_queue, print_document_pickup_verification · 1½ din

### 14. Eco bag return + Social Impact hub
zaff_eco_bag_zero_plastic_hub, doorstep_bag_return_instant_cashback, eco_bag_return_modal, checkout_eco_wallet_bag_return_toggle, zaff_it_social_impact_* (2) · 1 din

### 15. City expansion engine (Borawar/Kuchaman/Didwana)
city_switch_transition, kuchaman_launch_meter, zaff_it_city_expansion_engine_pre_launch_data_harvester · POST-launch

### 16. Payment EMI options screen (cosmetic)
payment_options_emi_zaff_it, payment_processing_bank_otp · Razorpay already handles · ¼ din

## 🔒 Founder-blocked (code ready jab creds aayenge)
- Medicine checkout v5 + prescription R2+OCR (R2 creds ×5 chahiye)
- Real SMS OTP provider · Razorpay LIVE keys · EAS/Play Store builds · CPC/CPM pricing · GST docs

## 🧹 Pre-launch code checklist (chhota, pending)
- [ ] 025 SQL file: 2 CHECK rebuilds + 024 `%:02s` typo patch (DB live sahi hai, file sync baaki)
- [ ] 2 QA ad campaigns cancel (`9c40e372…`, `96b54678…`)
- [ ] RLS audit as non-superuser (anon key se policies test)
- [ ] Device pe Razorpay test + COD full round
