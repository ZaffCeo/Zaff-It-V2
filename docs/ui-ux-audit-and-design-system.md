# ZAFF-IT UI/UX Audit, Screen Inventory & Unified Design System (v1.0)

**Source Archive:** `stitch_zaff_it_local_commerce_ecosystem.zip` (190 HTML screens, 194 PNGs, 4 Markdown files)  
**Audit Date:** 2026-11-26  
**Target Stack:** React Native + Expo (Managed SDK 57+, TypeScript), Supabase PostgreSQL, Cloudflare R2, OpenStreetMap/OSRM  
**Pilot Mode:** Makrana Merchant-First (Dark Store schema built in DB, feature-flagged until **500 orders/day**)

---

## 1. Executive Summary

An exhaustive programmatic and structural audit of all **190 HTML screens** and **4 Markdown design/blueprint files** in the Stitch export revealed strong visual ambition alongside critical engineering, accessibility, and scope-discipline gaps that must be resolved before React Native implementation:

| Metric | Count / Finding | Impact |
| :--- | :--- | :--- |
| **Total Stitch HTML Screens** | **190** (154 Light, 36 Dark) | Heavy duplication and theme split |
| **P0 MVP Core Screens (after merge)** | **~48 consolidated screens** across 4 surfaces + **6 new compliance/ops screens** | Lean, shippable v1 |
| **Conflicting Design Systems** | **3 competing `DESIGN.md` files** + 6 font families | Inconsistent colors, radii, and type |
| **Undersized Touch Targets (`<44dp`)** | **98 / 190 screens (51.6%)** | Mis-taps on budget Android devices |
| **Micro-Typography (`<11px`)** | **104 / 190 screens (54.7%)** | Fails readability & WCAG AA |
| **Hardcoded `"10-min"` Promises** | **45 / 190 screens (23.7%)** | Violates Makrana dynamic ETA policy |
| **Missing Empty / Error / Loading States** | **188 missing Empty, 184 missing Error/Retry, 48 missing Loading** | Fragile offline/low-network UX |
| **Missing Safe-Area Insets** | **12 / 190 screens** (Splash, Admin, SVGs) | Notch / gesture-bar clipping |
| **Hardcoded Dummy Data** | `Aslam Khan` (42), `#ZF-84291` (35), `#ZAF-8821` (11), `Al Madina` (6), `GRP-MKR-9042` (5) | Must bind to live Supabase models |

---

## 2. Concrete UI/UX Flaws & Remediation Plan

1. **Three Conflicting Design Systems & Theme Split**
   - *Flaw:* `midnight_stealth_cyber_gold/DESIGN.md` uses `#121317` + `#FFC703` + `#00E676` (`Plus Jakarta Sans`); `quick_velocity_commerce/DESIGN.md` uses `#F8F9FA` + `#765B00` + `#10B981`; `pitch_cyber_gold/DESIGN.md` uses `#121316` + `#FFD233` + `Outfit`. Six fonts appear across HTMLs (`Inter`, `Plus Jakarta Sans`, `Outfit`, `Montserrat`, `Poppins`, `Material Symbols Outlined`), and **Electric Green `#0C831F`** is missing from the Stitch tokens.
   - *Fix:* Unify onto **ZAFF-IT Design System v1.0** (`packages/shared/src/tokens.ts`): Charcoal Black (`#121416`), Golden Yellow (`#FFC703`), Electric Green (`#0C831F`), `Plus Jakarta Sans` (display/labels) + `Inter` (body/tabular-nums).

2. **Low Contrast & Micro-Text (`<11px`)**
   - *Flaw:* 104 screens use `text-[8px]`–`text-[10px]`; 19 screens use low-opacity text (`text-white/20`–`40`, `text-slate-300`); light-mode screens occasionally place amber/yellow text on white surfaces.
   - *Fix:* Enforce a strict **`11px` caption floor** (`TYPOGRAPHY.captionMin`), require `#121416` ink on `#FFC703` buttons (11.4:1 contrast), `#FFFFFF` ink on `#0C831F` badges (4.8:1 contrast), and `#94A3B8` minimum muted ink on `#121416`.

3. **Touch Targets Under `44dp` & Missing Safe-Area Insets**
   - *Flaw:* 98 screens use `h-5`–`h-9` / `w-5`–`w-9` / `p-1` on interactive `<button>` and `<a>` elements (20–36px). 12 screens (`animated_svg_1/2`, 3 splash screens, 5 admin consoles, `operations_hub`, `request_it_tenders`) omit `safe-area` / `env(safe-area-inset-*)`.
   - *Fix:* Enforce `TOUCH_TARGETS.minSize = 44` dp (`48` dp recommended, `52`–`56` dp for primary CTAs and Rider/Merchant action buttons) and wrap all screens in `SafeAreaView` / `useSafeAreaInsets()`.

4. **Missing Loading, Empty, and Error/Retry States**
   - *Flaw:* Only 2 screens (`empty_cart_out_of_stock_zaff_it`, `location_outside_makrana_unserviceable_area`) model empty/unserviceable states, only 6 model explicit error/retry states (`network_error_offline_support_zaff_it`, `penny_drop_verification_failed_error_retry`, etc.), and 48 screens lack loading skeletons.
   - *Fix:* Mandate shared `<SkeletonLoader />`, `<EmptyState />`, and `<ErrorRetryState />` components on every data-fetching screen.

5. **Hardcoded `"10-Min"` Delivery Promises & Dummy Entities**
   - *Flaw:* 45 screens hardcode `"10-min"` / `"10 minutes"` / `"10 मिनट"` promises, contradicting the Makrana merchant-first operational reality. Dozens of screens hardcode `#ZF-84291`, `#ZAF-8821`, `Aslam Khan`, and `Al Madina`.
   - *Fix:* Replace all fixed 10-min strings with dynamic `etaMin–etaMax` computed from merchant prep SLA + OSRM distance, and bind all order/rider/merchant fields to Supabase queries.

6. **Missing 6 Compliance & Operational Screens (Required for P0 Launch)**
   - **Language Switcher** (English / Hindi / Hinglish persistence)
   - **Delete Account Flow** (Play Store & DPDP Act mandatory self-serve deletion + grace window)
   - **Privacy Policy & Terms of Service Viewer** (consent + versioning)
   - **Coupons & Merchant Offers** (merchant-funded promo codes; replaces premature Z-Coins)
   - **Rider KYC & Shift Selfie Gate** (live selfie + DL/RC/UPI verification before `is_online = true`)
   - **Admin Geofence & Rules Editor** (Makrana service polygon, dynamic ETA bounds, fee/surge rules)

---

## 3. Complete 190-Screen Inventory & Categorization

Categories: **Customer** | **Merchant** | **Rider** | **Admin** | **Dark-Store/P1** | **Duplicate/Variant/Out-of-scope-for-v1**

| # | Stitch Screen Folder | Category | MVP Status | Notes / Consolidation Target |
| :--- | :--- | :--- | :--- | :--- |
| 001 | `active_trip_live_navigation` | Rider | P0 Keep | Active delivery OSRM navigation + handover trigger |
| 002 | `admin_ad_inventory_approval_console` | Admin | Duplicate/Variant/Out-of-scope-for-v1 | Ads console deferred post-MVP |
| 003 | `al_madina_basmati_deal_biryani_recipe_kit_bundle` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Hardcoded promo bundle variant |
| 004 | `al_madina_basmati_deal_merchant_landing_pop_up` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Hardcoded promo modal variant |
| 005 | `al_madina_print_terminal_queue` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Print/Xerox vertical out of v1 scope |
| 006 | `al_madina_storefront_customer_preview` | Customer | P0 Merge | Merge into generic Merchant Storefront screen |
| 007 | `animated_svg_1` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Standalone SVG asset experiment |
| 008 | `animated_svg_2` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Standalone SVG asset experiment |
| 009 | `app_launch_splash_animation_25_30_min_eta_1` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Splash variant; use #175 |
| 010 | `app_launch_splash_animation_25_30_min_eta_2` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Splash variant; use #175 |
| 011 | `app_launch_splash_animation_zaff_it` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Splash variant (has 10-min copy) |
| 012 | `app_launch_splash_auto_redirect_to_login_screen` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Splash variant; merge redirect logic into #175 |
| 013 | `app_launch_splash_correct_logo_core_features` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Splash variant |
| 014 | `authentication_location_onboarding_zaff_it` | Customer | P0 Merge | Merge into Phone Login (#151) + Location (#076) |
| 015 | `backup_rider_emergency_handover_bag_pickup_zaff_it` | Rider | P0 Merge | Merge into Rider SOS & Re-dispatch (#133) |
| 016 | `batch_live_customer_broadcast_sent` | Dark-Store/P1 | P1 Post-500/day | Group/batch order broadcast (P1) |
| 017 | `batch_scan_4_items_ready` | Dark-Store/P1 | P1 Post-500/day | Dark-store batch picker scan (P1) |
| 018 | `batch_settlement_earning_receipt_grp_mkr_9042` | Dark-Store/P1 | P1 Post-500/day | Batch settlement receipt (P1) |
| 019 | `book_karigar_instant_schedule_area_flow` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Karigar/services vertical out of v1 scope |
| 020 | `cancellation_instant_upi_refund_receipt` | Customer | P0 Merge | Merge into Order Detail / Cancellation modal (#037) |
| 021 | `cart_checkout_flow_zaff_it` | Customer | P0 Keep | Canonical Cart & Checkout screen |
| 022 | `cart_checkout_midnight_dark_mode` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Dark-mode duplicate of #021 |
| 023 | `cart_checkout_oled_cyber_gold_edition` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | OLED duplicate of #021 |
| 024 | `cash_cod_reconciliation` | Admin | P0 Merge | Merge into Admin COD Vault (#032) |
| 025 | `category_deep_dive_catalog_zaff_it` | Customer | P0 Keep | Canonical Category & Sub-category Product Grid |
| 026 | `checkout_eco_wallet_bag_return_toggle` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Eco-bag wallet deferred post-MVP |
| 027 | `checkout_khushiyon_ka_hissa_ahsaas_apna_trust` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Charity donation card deferred post-MVP |
| 028 | `checkout_khushiyon_ka_hissa_donation_card` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #027 |
| 029 | `checkout_review_cod` | Customer | P0 Merge | Merge COD toggle into #021 |
| 030 | `city_switch_transition_borawar_didwana_launch_meter` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Pre-launch voting/expansion widget |
| 031 | `cod_and_financials` | Admin | P0 Merge | Merge into Admin COD Vault (#032) |
| 032 | `cod_cash_vault_rider_payouts_admin_control_tower` | Admin | P0 Keep | Canonical Admin COD Vault & Rider Payouts |
| 033 | `confirm_pin_add_complete_address_zaff_it_light_mode` | Customer | P0 Keep | Canonical Address Pin & Details Form |
| 034 | `counter_instructions` | Customer | P0 Merge | Merge delivery/counter instructions into #021 |
| 035 | `courier_parcel_dukan_tiffin_delivery` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | P2P parcel/tiffin vertical out of v1 scope |
| 036 | `customer_group_order_shared_cart_zaff_it` | Dark-Store/P1 | P1 Post-500/day | Mohalla group order (P1) |
| 037 | `customer_order_cancel_modify_modal` | Customer | P0 Keep | Canonical Order Cancel / Modify Bottom Sheet |
| 038 | `customer_order_history_midnight_dark_mode` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Dark-mode duplicate of #039 |
| 039 | `customer_order_history_past_bills_zaff_it` | Customer | P0 Keep | Canonical Customer Order History |
| 040 | `customer_profile_live_order_tracking` | Customer | P0 Keep | Canonical Customer Profile & Settings |
| 041 | `customer_profile_midnight_dark_mode` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Dark-mode duplicate of #040 |
| 042 | `customer_quick_setup_name_delivery_location_step_3_of_3` | Customer | P0 Merge | Merge into Onboarding (#076 / #033) |
| 043 | `customer_rating_rider_tip_zaff_it_coin_reward` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Z-Coin reward variant; use #044 without coins |
| 044 | `customer_rating_rider_tip_zf_84291` | Customer | P0 Keep | Canonical Post-Delivery Rating & Tip Modal |
| 045 | `customer_support_live_chat` | Customer | P0 Keep | Canonical Help & Support Chat |
| 046 | `delivery_handover_otp` | Rider | P0 Keep | Canonical Rider Delivery OTP Handover |
| 047 | `delivery_handover_rating_zf_84291` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #044 / #046 |
| 048 | `delivery_otp_handover_cust_881_drop_1_of_6` | Dark-Store/P1 | P1 Post-500/day | Multi-drop batch handover (P1) |
| 049 | `deposit_success_shift_closed_confirmation_receipt_zaff_it` | Rider | P0 Merge | Merge into Rider COD Deposit (#138) |
| 050 | `dispute_resolved_store_cleared_disp_84291_m` | Merchant | P0 Merge | Merge into Merchant Order/Dispute Detail (#120) |
| 051 | `document_print_xerox_flow` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Print/Xerox vertical out of v1 scope |
| 052 | `doorstep_bag_return_instant_cashback` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Eco-bag cashback deferred post-MVP |
| 053 | `doorstep_proof_digital_signature_zaf_8821` | Rider | P0 Merge | Merge POD photo/OTP into #046 |
| 054 | `dukan_switch_cart_recalculation_eta_preview` | Customer | P0 Keep | Single-store cart switch confirmation modal |
| 055 | `eco_bag_return_quick_info_modal_zaff_it` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Eco-bag modal deferred post-MVP |
| 056 | `empty_cart_out_of_stock_zaff_it` | Customer | P0 Keep | Canonical Empty Cart & Out-of-Stock state |
| 057 | `fixed_price_banner_booking_calendar` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Ad banner booking out of v1 scope |
| 058 | `gold_ust_d_tier_unlock_celebration` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Premature loyalty gamification |
| 059 | `group_cart_locked_member_payment_collect_whatsapp_links` | Dark-Store/P1 | P1 Post-500/day | Mohalla group order (P1) |
| 060 | `group_cart_locked_privacy_protected_payment_collect` | Dark-Store/P1 | P1 Post-500/day | Mohalla group order (P1) |
| 061 | `heavy_trailer_16_wheel_22_wheel_freight_rate_card_zaff_move` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Heavy freight logistics out of v1 scope |
| 062 | `how_z_coins_work_faq_guide` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Z-Coins FAQ deferred post-MVP |
| 063 | `hydra_crane_hourly_rental_rate_card_zaff_it` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Crane rental out of v1 scope |
| 064 | `instant_upi_verification_success_aslam_khan` | Rider | P0 Merge | Merge into Rider Bank/UPI Settings (#130) |
| 065 | `interactive_checkout_payment_modal_demo_zaff_it` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Interactive demo duplicate of #021 |
| 066 | `invoice_pdf_viewer_zf_84291` | Customer | P0 Keep | Digital Tax Invoice / Receipt Viewer |
| 067 | `kohinoor_legend_level_4_perks_roadmap` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Premature loyalty tier roadmap |
| 068 | `kuchaman_launch_meter_10_votes_surge_boost_animation` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | City expansion voting widget |
| 069 | `live_delivery_tracking_zaffy_indian_road_obstacle_adventure` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Gamified tracking duplicate of #070 |
| 070 | `live_order_tracking_eta_map_zaff_it` | Customer | P0 Keep | Canonical Live Order Tracking & ETA Map |
| 071 | `live_order_tracking_full_map` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #070 |
| 072 | `live_order_tracking_with_zaffy_mascot` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #070 |
| 073 | `live_print_tracking_otp` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Print vertical out of v1 scope |
| 074 | `live_tracking_zaffy_delivery_tip_dialog` | Customer | P0 Merge | Merge tip trigger into #070 / #044 |
| 075 | `location_outside_makrana_unserviceable_area` | Customer | P0 Keep | Canonical Unserviceable Area Error State |
| 076 | `location_permission_delivery_address_zaff_it_light_mode` | Customer | P0 Keep | Canonical Location Permission & Address Picker |
| 077 | `marble_heavy_cargo_booking_zaff_move` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Heavy cargo vertical out of v1 scope |
| 078 | `marble_mandi_heavy_machinery_specialists_zaff_it` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Heavy machinery vertical out of v1 scope |
| 079 | `merchant_daily_khata_udhaar_book_al_madina` | Merchant | P0 Merge | Merge into Merchant Earnings & Khata (#081) |
| 080 | `merchant_damaged_pack_replacement_return_zaff_it` | Merchant | P0 Keep | Merchant Return / Replacement Handling |
| 081 | `merchant_earnings_khata` | Merchant | P0 Keep | Canonical Merchant Earnings & Settlement Ledger |
| 082 | `merchant_group_order_packing_6_packets_station` | Dark-Store/P1 | P1 Post-500/day | Group/dark-store packing station (P1) |
| 083 | `merchant_incoming_order_loud_alert_kot` | Merchant | P0 Keep | Canonical Merchant Incoming Order KOT Ring |
| 084 | `merchant_inventory_stock` | Merchant | P0 Keep | Canonical Merchant Inventory & Stock Toggle |
| 085 | `merchant_inventory_stock_zero_typing` | Merchant | P0 Merge | Merge quick-toggle UX into #084 |
| 086 | `merchant_live_orders_prep` | Merchant | P0 Keep | Canonical Merchant Live Orders & Prep Queue |
| 087 | `merchant_order_delay_alert_actions` | Merchant | P0 Merge | Merge delay action sheet into #086 |
| 088 | `merchant_order_pause_confirmation_modal` | Merchant | P0 Merge | Merge store-pause modal into #090 / #086 |
| 089 | `merchant_setup_dukan_kyc_gst_step_3_of_3` | Merchant | P0 Keep | Canonical Merchant KYC & Store Onboarding |
| 090 | `merchant_store_timings_operating_schedule` | Merchant | P0 Keep | Canonical Merchant Operating Hours & Holidays |
| 091 | `merchants_and_inventory` | Admin | P0 Keep | Canonical Admin Merchant & Catalog Governance |
| 092 | `mohalla_group_order_100_privacy_protected_cart` | Dark-Store/P1 | P1 Post-500/day | Mohalla group order (P1) |
| 093 | `mohalla_group_order_individual_self_pay_privacy_cart` | Dark-Store/P1 | P1 Post-500/day | Mohalla group order (P1) |
| 094 | `mohalla_order_dispatched_live_combined_delivery_tracking` | Dark-Store/P1 | P1 Post-500/day | Mohalla group order (P1) |
| 095 | `mohalla_order_locked_individual_self_payment_progress` | Dark-Store/P1 | P1 Post-500/day | Mohalla group order (P1) |
| 096 | `mohammad_rafiq_ac_specialist_profile` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Karigar/AC repair vertical out of v1 scope |
| 097 | `my_ad_bookings_campaigns` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Self-serve ad bookings deferred post-MVP |
| 098 | `my_cart_checkout_al_madina_store` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Store-specific duplicate of #021 |
| 099 | `network_error_offline_support_zaff_it` | Customer | P0 Keep | Canonical Network Error / Offline Retry State |
| 100 | `night_cravings_flash_deals_hub_zaff_it` | Customer | P0 Merge | Merge into Category / Flash Deals section on #174 |
| 101 | `notifications_activity_feed_zaff_it` | Customer | P0 Keep | Canonical In-App Notification Center |
| 102 | `operations_hub` | Admin | P0 Merge | Merge into Admin Operations Radar (#103) |
| 103 | `operations_radar_admin_control_tower` | Admin | P0 Keep | Canonical Admin Operations Radar (Web/Tablet) |
| 104 | `order_confirmed_live_tracking_zf_84291` | Customer | P0 Merge | Merge into #110 -> #070 |
| 105 | `order_filter_date_range_selector_zaff_it` | Customer | P0 Merge | Merge filter sheet into Order History (#039) |
| 106 | `otp_4_digit_auto_fill_verification_zaff_it_light_mode` | Customer | P0 Keep | Canonical 4-Digit OTP Verification |
| 107 | `parchi_whatsapp_list_scanner` | Customer | P0 Keep | Parchi / WhatsApp List Photo Order (Gemini API) |
| 108 | `payment_options_emi_zaff_it` | Customer | P0 Merge | Strip EMI/PayLater; merge UPI/Card/COD into #021 |
| 109 | `payment_processing_bank_otp_zaff_it` | Customer | P0 Keep | Razorpay Payment Processing / Bank OTP State |
| 110 | `payment_success_order_confirmed_zaff_it` | Customer | P0 Keep | Canonical Order Confirmed Celebration & ETA |
| 111 | `penny_drop_1_verification_success_aslam_khan` | Rider | P0 Merge | Merge into Rider Bank/UPI Settings (#130) |
| 112 | `penny_drop_verification_failed_error_retry` | Rider | P0 Merge | Merge error state into #130 |
| 113 | `pickup_status_token` | Dark-Store/P1 | P1 Post-500/day | Dark-store token queue (P1) |
| 114 | `pickup_status_token_with_alert_previews` | Dark-Store/P1 | P1 Post-500/day | Dark-store token queue variant (P1) |
| 115 | `print_document_pickup_verification` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Print vertical out of v1 scope |
| 116 | `pro_booking_1_tap_payment_modal` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Pro membership booking deferred post-MVP |
| 117 | `product_details_oled_cyber_gold_edition` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | OLED duplicate of #118 |
| 118 | `product_details_page_pdp_amul_taaza_milk` | Customer | P0 Keep | Canonical Product Details Page (PDP) |
| 119 | `product_details_pdp_dark_mode_edition` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Dark-mode duplicate of #118 |
| 120 | `raise_merchant_dispute_ret_84291` | Merchant | P0 Keep | Merchant Dispute Submission Modal |
| 121 | `replacement_live_rider_swap_tracking_zf_84291` | Customer | P0 Merge | Merge replacement tracking into #070 / #128 |
| 122 | `request_it_bidding_quotes` | Dark-Store/P1 | P1 Post-500/day | Request-It reverse bidding (P1) |
| 123 | `request_it_procurement` | Dark-Store/P1 | P1 Post-500/day | Request-It procurement (P1) |
| 124 | `request_it_runner_quotation_approval` | Dark-Store/P1 | P1 Post-500/day | Request-It runner quote approval (P1) |
| 125 | `request_it_super_hub_errands` | Dark-Store/P1 | P1 Post-500/day | Request-It custom errand hub (P1) |
| 126 | `request_it_tenders` | Admin | P1 Post-500/day | Request-It tenders (P1) |
| 127 | `request_it_tenders_admin_control_tower` | Admin | P1 Post-500/day | Request-It tenders admin (P1) |
| 128 | `return_replacement_order_zf_84291` | Customer | P0 Keep | Canonical Return / Replacement Request Flow |
| 129 | `rider_6_drop_sequenced_navigation_batch_grp_mkr_9042` | Dark-Store/P1 | P1 Post-500/day | 6-drop batch navigation (P1) |
| 130 | `rider_bank_upi_disbursement_settings` | Rider | P0 Keep | Canonical Rider Bank & UPI Payout Settings |
| 131 | `rider_duty_dispatch_radar` | Rider | P0 Keep | Canonical Rider Duty Toggle & Dispatch Radar |
| 132 | `rider_earnings_payout_schedule` | Rider | P0 Keep | Canonical Rider Earnings & Payout History |
| 133 | `rider_emergency_sos_breakdown_re_dispatch_zaff_it` | Rider | P0 Keep | Canonical Rider SOS & Emergency Re-dispatch |
| 134 | `rider_group_batch_pickup_store_handover_otp` | Dark-Store/P1 | P1 Post-500/day | Batch pickup handover (P1) |
| 135 | `rider_parcel_pickup_photo_verification` | Rider | P0 Keep | Canonical Rider Store Pickup Photo & Seal Check |
| 136 | `rider_partner_new_order_alert_map_otp_delivery` | Rider | P0 Keep | Canonical Rider Incoming Order Offer Ring |
| 137 | `rider_partner_setup_license_vehicle_step_3_of_3` | Rider | P0 Keep | Canonical Rider KYC / Vehicle Onboarding |
| 138 | `rider_shift_end_cod_cash_deposit_vault_handover_zaff_it` | Rider | P0 Keep | Canonical Rider Shift-End COD Vault Deposit |
| 139 | `role_comparison_customer_rider_merchant` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Marketing comparison duplicate of #144 |
| 140 | `role_detail_workspace_switch_merchant_mode` | Customer | P0 Merge | Merge role switcher into #147 |
| 141 | `saved_addresses_1_tap_switcher_zaff_it` | Customer | P0 Keep | Canonical Saved Addresses Bottom Sheet |
| 142 | `scan_barcode_naya_saman_jodein` | Merchant | P0 Keep | Canonical Merchant Barcode Scanner Add SKU |
| 143 | `send_parcel_urgent_dawa_spares_booking` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | P2P courier vertical out of v1 scope |
| 144 | `sign_up_select_your_role_zaff_it_light_mode` | Customer | P0 Keep | Canonical Role Selection (Customer/Merchant/Rider) |
| 145 | `sponsored_brand_store_amul_dairy_hub_modal` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Sponsored brand modal deferred post-MVP |
| 146 | `swap_success_fresh_order_receipt_zf_84291` | Customer | P0 Merge | Merge into #128 |
| 147 | `switch_role_workspace_account_profile` | Customer | P0 Keep | Canonical Multi-Role Workspace Switcher |
| 148 | `tax_invoice_digital_bill_slip_zf_84291` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #066 |
| 149 | `tip_payment_confirmation_receipt_aslam_khan` | Customer | P0 Merge | Merge into #044 |
| 150 | `universal_search_filter_results_zaff_it` | Customer | P0 Keep | Canonical Universal Search & Filter Results |
| 151 | `welcome_to_zaff_it_login_sign_in_light_mode` | Customer | P0 Keep | Canonical Phone Login / Sign-in Screen |
| 152 | `whatsapp_referral_invite_modal` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Referral modal deferred post-MVP |
| 153 | `workspace_switch_instant_confirmation_mode_transition` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Animation duplicate of #147 |
| 154 | `z_coins_level_tier_status` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Premature Z-Coins loyalty excluded from v1 |
| 155 | `z_coins_level_tier_status_updated_z_coin_emblem` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #154 |
| 156 | `z_coins_level_tier_status_zaff_it_emblem` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #154 |
| 157 | `z_coins_passbook_ledger_real_time_statement` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Premature Z-Coins loyalty excluded from v1 |
| 158 | `z_coins_passbook_ledger_updated_z_coin_emblem` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #157 |
| 159 | `z_coins_rewards_official_zaff_it_coin_wallet` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Premature Z-Coins loyalty excluded from v1 |
| 160 | `z_coins_rewards_wallet` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #159 |
| 161 | `z_coins_rewards_wallet_updated_z_coin_emblem` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #159 |
| 162 | `z_coins_transaction_receipt_20_coins_detail` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #159 |
| 163 | `zaff_ads_premium_ad_placements_hub` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Self-serve ads deferred post-MVP |
| 164 | `zaff_eco_bag_zero_plastic_hub` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Eco-bag hub deferred post-MVP |
| 165 | `zaff_fresh_catalog` | Customer | P0 Merge | Merge into Category Deep-Dive (#025) |
| 166 | `zaff_help_support_hub` | Customer | P0 Merge | Merge into Support (#045) |
| 167 | `zaff_home_floating_quick_cart` | Customer | P0 Merge | Merge floating cart bar into #174 |
| 168 | `zaff_it_city_expansion_engine_pre_launch_data_harvester` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Pre-launch city voting micro-site |
| 169 | `zaff_it_emerald_freshness_launch_splash` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Splash variant; use #175 |
| 170 | `zaff_it_home_hub` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Home variant; use #174 |
| 171 | `zaff_it_home_slot_1_live_sponsored_banner_view` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Home banner variant; use #174 |
| 172 | `zaff_it_home_zero_plastic_eco_bag_banner` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Home banner variant; use #174 |
| 173 | `zaff_it_minimal_animated_logo_splash` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Splash variant; use #175 |
| 174 | `zaff_it_normal_light_mode_home_hub` | Customer | P0 Keep | Canonical Customer Home Hub (adapt to theme tokens) |
| 175 | `zaff_it_official_3d_mascot_splash_screen` | Customer | P0 Keep | Canonical App Launch Splash Screen |
| 176 | `zaff_it_social_impact_ahsaas_apna_trust_hub` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Social impact hub deferred post-MVP |
| 177 | `zaff_it_social_impact_transparency_hub` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Duplicate of #176 |
| 178 | `zaff_it_splash_category_showcase_modal_sonic_engine` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Splash variant; use #175 |
| 179 | `zaff_it_splash_sound_chime_haptic_engine` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Splash variant; use #175 |
| 180 | `zaff_it_super_home_animated_sponsored_banners` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Home variant; use #174 |
| 181 | `zaff_it_super_home_screen` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Home variant; use #174 |
| 182 | `zaff_it_super_home_screen_best_sellers_category_carousels` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Home variant; use #174 |
| 183 | `zaff_it_super_home_screen_oled_cyber_gold_edition` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | OLED home variant; use #174 |
| 184 | `zaff_move_local_transport_logistics_hub` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Heavy transport vertical out of v1 scope |
| 185 | `zaff_pro_partner_199_mo_membership` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Premature subscription excluded from v1 |
| 186 | `zaff_pros_local_karigar_service_hub` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Karigar/services vertical out of v1 scope |
| 187 | `zaff_vip_benefits_giveaways` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Premature VIP club excluded from v1 |
| 188 | `zaff_vip_concierge_fast_pass` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | Premature VIP club excluded from v1 |
| 189 | `zaffy_ai_chat` | Customer | P0 Keep | Zaffy AI Assistant (Gemini Free Tier, read-only/cart assist) |
| 190 | `zaffy_ai_order_delay_auto_compensation_modal` | Duplicate/Variant/Out-of-scope-for-v1 | Exclude v1 | AI must never autonomously issue refunds/compensation |

### Missing 6 Compliance & Operational Screens (New for P0)

| # | Screen Name | Surface | Why Mandatory for v1 |
| :--- | :--- | :--- | :--- |
| N1 | **Language Switcher (EN / HI / Hinglish)** | Shared (All) | Makrana merchant/rider accessibility |
| N2 | **Delete Account Flow** | Customer / Shared | Google Play Store & DPDP Act compliance |
| N3 | **Privacy Policy & Terms of Service** | Shared (Auth & Profile) | Legal consent & Play Store review compliance |
| N4 | **Coupons & Merchant Offers** | Customer / Merchant | Merchant-funded discounts (replaces Z-Coins) |
| N5 | **Rider KYC & Shift Selfie Gate** | Rider | Liveness/selfie + DL/RC/UPI gate before going online |
| N6 | **Admin Geofence & Rules Editor** | Admin | Makrana polygon geofence, ETA bounds, fee/surge rules |

---

## 4. Consolidated MVP Navigation Map

### A. Auth & Onboarding (Shared)
- `SplashScreen (#175)` -> `PhoneLogin (#151)` + `[Privacy/Terms (N3)]` -> `OtpVerify (#106)` -> `RoleSelect (#144)` ->
  - Customer: `LocationPermission (#076)` -> `AddressPinForm (#033)` -> `CustomerTabs` (or `UnserviceableArea (#075)`)
  - Merchant: `MerchantKycSetup (#089)` -> `MerchantTabs`
  - Rider: `RiderKycSetup (#137)` -> `RiderShiftSelfieGate (N5)` -> `RiderTabs`

### B. Customer App (`CustomerTabs`)
- **Home Tab:** `HomeHub (#174)` -> `MerchantStorefront (#006)` / `CategoryGrid (#025)` / `UniversalSearch (#150)` / `ParchiScanner (#107)` / `ZaffyAIChat (#189)` -> `ProductDetail (#118)`
- **Cart & Checkout Stack:** `CartCheckout (#021)` + `CouponsOffers (N4)` + `StoreSwitchModal (#054)` + `EmptyCart (#056)` -> `PaymentProcessing (#109)` -> `OrderConfirmed (#110)` -> `LiveTracking (#070)`
- **Orders Tab:** `OrderHistory (#039)` -> `OrderDetail` / `CancelModify (#037)` / `InvoiceViewer (#066)` / `ReturnReplacement (#128)` / `RatingTip (#044)`
- **Profile Tab:** `CustomerProfile (#040)` -> `SavedAddresses (#141)` / `Notifications (#101)` / `HelpSupport (#045)` / `LanguageSwitcher (N1)` / `WorkspaceSwitch (#147)` / `DeleteAccount (N2)` / `PrivacyTerms (N3)`

### C. Merchant App (`MerchantTabs`)
- **Orders Tab:** `LiveOrdersPrep (#086)` + `IncomingOrderKOTModal (#083)` + `DamagedPackReturn (#080)` + `RaiseDispute (#120)`
- **Catalog Tab:** `InventoryStock (#084)` -> `BarcodeScannerAddSKU (#142)`
- **Khata Tab:** `MerchantEarningsKhata (#081)`
- **Store Tab:** `StoreTimings (#090)` / `LanguageSwitcher (N1)` / `WorkspaceSwitch (#147)`

### D. Rider App (`RiderTabs`)
- **Duty Tab:** `ShiftSelfieGate (N5)` -> `DispatchRadar (#131)` + `IncomingOfferRing (#136)` -> `PickupPhotoVerify (#135)` -> `ActiveNavigation (#001)` -> `HandoverOTP (#046)` + `EmergencySOS (#133)`
- **Earnings Tab:** `EarningsSchedule (#132)` -> `ShiftEndCodDeposit (#138)`
- **Profile Tab:** `BankUpiSettings (#130)` / `LanguageSwitcher (N1)` / `WorkspaceSwitch (#147)`

### E. Admin Control Tower (Web / Tablet)
- `OperationsRadar (#103)` (Live fleet, orders, alerts)
- `MerchantsAndInventory (#091)` (KYC approvals, catalog moderation)
- `CodCashVault (#032)` (Rider COD reconciliation & payouts)
- `GeofenceAndRulesEditor (N6)` (Makrana service polygon, dynamic ETA & fee config)

*(Dark-Store / Batch / Mohalla Group / Request-It modules remain schema-ready in PostgreSQL and hidden behind `enable_dark_store` / `enable_p1_verticals` feature flags until 500 orders/day.)*

---

## 5. Unified `DESIGN.md` Specification (v1.0)

- **Brand Palette:**
  - `charcoalBlack`: `#121416` (Primary Dark Canvas, Primary Button Ink)
  - `goldenYellow`: `#FFC703` (Primary Brand Accent, Primary CTA Fill, Active Badges)
  - `electricGreen`: `#0C831F` (Live Dispatch, In-Stock, Verified Status, Freshness)
  - Dark Surfaces: `#0B0C0E` (Lowest), `#121416` (Base), `#181A1E` (Card), `#202328` (Elevated), `#292D33` (Modal)
  - Light Surfaces: `#F8F9FA` (Base), `#FFFFFF` (Card), `#F1F3F5` (Muted), `#E2E8F0` (Border)
- **Typography:**
  - Display & Labels: `Plus Jakarta Sans` (Weights `600`, `700`, `800`)
  - Body & Numeric Data: `Inter` with `tabular-nums` (Weights `400`, `500`, `600`)
  - Strict Floor: **`11px` minimum** (`captionMin`), zero `8px`/`9px`/`10px` text.
- **Spacing & Radii (4px Grid):**
  - Spacing: `xs=4`, `sm=8`, `md=12`, `lg=16`, `xl=24`, `xxl=32`; `gutter=12`, `screenPadding=16`.
  - Radii: `xs=4`, `sm=8`, `md=12`, `lg=16`, `xl=24`, `full=9999`.
- **Accessibility & Ergonomics:**
  - Minimum touch target: **`44dp`** (`48dp` recommended, `52dp` primary CTA, `56dp` Rider/Merchant critical actions).
  - Safe-area insets mandatory on 100% of screens (`react-native-safe-area-context`).
  - Every data screen must implement `<SkeletonLoader />`, `<EmptyState />`, and `<ErrorRetryState />`.
