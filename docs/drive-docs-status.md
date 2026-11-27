# ZAFF-IT — Drive Documents vs Implementation Status
Scanned 2026-11-27 · Sources: `ZAFF-IT-Project-Document.docx.txt` (07:03 UTC aaj — canonical spec, "Discussion Phase" dated 27 Nov) · `stitch_zaff_it_local_commerce_ecosystem.zip` (06:13 UTC — **same 199 screens as local copy, koi naya design nahi**) · brand assets (Zaff-It New logo 05:43, zaffcoin icons 04:37).

Legend: ✅ DONE+working · 🟡 PARTIAL (exists, spec-rules pending) · ⛔ MISSING · 🎨 asset pending.

---

## 1. ⛔→✅ Document ke Phase-1 items — status

| Doc §17 Phase-1 item | Status | Evidence |
|---|---|---|
| Zaffy Text AI (L1 search/basket/price + L2 tickets + never-invent rules) | ✅ **SPEC SE AAGE** | Zaffy v14: multilingual chat, 16 tools, action proposals + confirm, memory, merchant mode; audit-hardened |
| Ticket (Ticket ID, reply target) | ✅ | support_tickets + `ticket_number` (TKT-SUP/TKT-REQ) |
| Wallet (closed) | 🟡 | ZaffCoin wallet live (ledger, streak, missions, bazaar) — **par doc-rules missing: 10%-of-cart usage cap, ₹10k max balance, 90/180-day bonus expiry, ₹100 first-500 bonus** |
| Zaff Kwick / Same Day | 🟡 | zones + eta + delivery fees hain; dedicated Kwick(20-30m)/SameDay(2h) slots + night Zone-B (1AM) + 2-min rider escalation ladder (wait/shift/free-cancel) ⛔ |
| COD + Online (Razorpay TEST) | ✅ | checkout-create-order + razorpay-webhook (HMAC, amount match); "no fake payments" = audit-verified server-authoritative |
| Seller settlement (next-morning, ledger) | 🟡 | settlement_ledger + khata summary hain; TCS 1%/TDS 1%/UTR breakup + Route auto-split ⛔ |
| Coming Soon Tab (Dark Store, Cabs, Ambulance, Express Truck, Move Truck) | ⛔ | app me tab nahi; DB me sirf dark_store fulfillment type |
| Invite (50/50, L1-L4, leaderboard, fake-prevention) | ⛔ | not built |
| Pro plans (Customer 49/99, Seller 199, handling-free) | ⛔ | not built |
| Zaff Ads (sponsored 1-2, Sponsored tag) | ⛔ | not built |
| Autopay (UPI Mandate, 30-day, grace) | ⛔ | optional per doc — deferred OK |
| Zaff Service (providers, escrow, quote engine, no-show) | ⛔ | role itself missing in DB (sirf 4 roles) |
| Zaff Sawari / Move / Express Up-Down | ⛔ | verticals missing |
| Medicine (10 stores, license-only, OCR prescription, pharmacist check, no H1/X) | ⛔ | category/flow missing |
| Laundry (₹69/99/15, 2h pickup, late-₹20 compensation) | ⛔ | missing |
| Splash 4 rotating screens (rider/loader/`Sab kuch ek jagah`/Zaffy map) | 🟡 | SplashAndOnboardingScreen hai; 4 doc-variants verify karna hai |
| Career tab (rider/office/intern, apply→Javed) | ⛔ | missing |
| OCR list-photo → cart (Miraz) | 🟡 | Parchi text-path live; **photo OCR R2×5 secrets pe blocked** (standing) |
| DPDP consent + Delete-my-data (7 din) | 🟡 | auth-delete-account fn ✅; itemised consent notice + policy screen ⛔ |

## 2. ✅ Doc se bahar, already shipped (waves + today)
- Stitch W1: premium Home (Parchi matcher, ZAFFFIRST ₹5000-off coupon, Request-It) — PR#29
- Stitch W2: Wallet rebuild + ZaffCoin + back-nav fixes — PR#30
- **Zaff Fresh — Apna Fruits Godown** (aaj): DB store + 8 fruits + Hindi search + Home banner
- Pipeline: founder-controlled PR flow, CI (tsc+deno), migration guide, deploy-script fix
- Security mission (aaj): 6 reports, S-01 stock-corruption fix (live-verified), token rotation, storage limits, 10 false-positives documented

## 3. 🎨 Assets pending adoption (Drive me naye, app me purane)
| Asset | Drive file | Action needed |
|---|---|---|
| **Zaff-It New logo** (05:43 aaj) | `Zaff-It New logo` (png) | Compare vs current brand-v3; swap if newer — splash/header/icons |
| ZaffCoin 512 + transparent logo (04:37 aaj) | 2 png | WalletScreen coin icon update |
| Zaffy Mascot (26 Nov) | `Zaffy Mascot Logo` | ZaffyChatScreen avatar 🤖 → mascot image |
| 01_customer_home.png + other refs | 26 Nov batch | reference-only |

## 4. Spec-vs-build mismatch deltas (fix in next waves)
1. **Delivery rates doc-updated**: doc 25/30/50 km-slabs, handling ₹5/₹10, free>199 par wallet-discount ke baad payable>199 rule — DB zones currently ₹20/₹25 base. Ek migration me align karna hai.
2. **Wallet usage cap 10%** + max-balance + expiry — wallet rules engine.
3. **Seller per-order fee ₹5-10** model vs current commission_bps — decide + implement.
4. **Rider COD pause rule** (10PM tak settle nahi → next-day pause) — rider app flow.

## 5. Recommended next wave order (doc-priority × effort)
1. **W3 (already queued): live-tracking/rating/tip** (Stitch) — customer polish
2. **W4: Monetization pack** — Invite L1-L4 + Pro plans + Ads-sponsored slots + wallet 10%-cap rules (ek saath, ek PR)
3. **W5: Delivery engine doc-align** — slabs, handling, night zone, rider escalation ladder
4. **W6: Roles expansion** — Service Provider (quote engine + escrow) pehle, phir Sawari/Move/Express
5. **W7: Medicine + Laundry** verticals
6. Brand asset swap (naya logo + coin icons + mascot) — chhota, W4 ke saath karna best

## 6. Founder-side (unchanged standing)
Razorpay webhook registration · SMS/Twilio creds · R2×5 (Parchi photo + OCR) · DATA_GOV_IN_API_KEY · GST docs (doc: TEST MODE until GST) · Android E2E after EAS creds.
