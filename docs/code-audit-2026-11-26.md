# Zaff-It V2 — Full Repo Audit (2026-11-26)

Scope: every folder/file of the mobile monorepo + edge functions + DB migrations.
Method: file-by-file read of high-risk surfaces (LOC risk map), pattern sweeps
(money-float, swallowed errors, dead URLs, leak-prone timers, RLS gaps, i18n parity),
then live verification (tsc, eslint, expo export, typing harness, login harness).

## Fixed in this PR (PR #54)

| # | Finding | Fix |
|---|---------|-----|
| 1 | **ESLint dead repo-wide** — eslint 9 defaults to flat config; no plugin configs wired, eslint not even a dependency. `npm run lint` was a no-op/error. | Added `eslint.config.js` (flat, TS+react+react-hooks), devDeps (`eslint@9`, `@eslint/js`, `typescript-eslint@8`, `eslint-plugin-react`, `eslint-plugin-react-hooks`), fixed root + mobile lint scripts. Result: **0 errors** (5 informational warnings). Metro `require('…png')` asset idiom + non-HTML JSX quotes whitelisted. Generated harness bundles + `.wrangler` ignored. |
| 2 | **packages/shared had no tsconfig.json** — standalone `tsc -p` impossible; only typechecked transitively. | Added `packages/shared/tsconfig.json` (strict, bundler resolution). `npx tsc -p packages/shared/tsconfig.json --noEmit` → **exit 0**. |
| 3 | **UniversalSearchScreen never ran initialQuery** — deep-link (home submit/voice) arrived with a query but showed the idle screen; results only appeared after manual typing. Also debounce `setTimeout` leaked on unmount. | Mount effect now auto-runs the initial query via `runSearchRef` + cleans up focus timer and debounce on unmount. |
| 4 | **`updateItemQuantity` stale coupon** — basket emptied via quantity edits kept `couponCode`/`promoCode` (clearCart clears them) → stale discount code could apply to the next store's cart. | Mirrors clearCart: coupon/promo nulled when the basket empties. |
| 5 | **Dead marketing URLs** — `https://zaff-it.vercel.app` hardcoded in WalletScreen WhatsApp share (host not deployed) and RazorpayCheckoutScreen `image:` (logo 404 on checkout popup). | Wallet share copy now says "Play Store par 'Zaff-It' search karo"; Razorpay `image` key removed (theme logo optional). |
| 6 | **PremiumTabBar missing visuals for `AdminApprovals` + `AdminCatalog`** — fell back to a blank ellipse icon with empty label in the admin tab bar. | Added icon mappings (`shield-checkmark`, `checkmark-done`). |
| 7 | **Typing harness driver exited via a ReferenceError** (`process.exit(ok ? 0 : 2)` with `ok` undefined) — masked as a crash instead of a clean pass. | Explicit `process.exit(typingOk ? 0 : 2)`; dead `RNW` var removed. |

## Verified clean (no action needed)

- **Money math:** all price handling uses integer paise; `toFixed` only at display format time (merchant/rider screens, `/100`). No float money leaks found.
- **Razorpay integrity:** checkout-create-order computes totals **server-side** via atomic RPC (`reserve_stock_and_create_order`); webhook verifies HMAC (`x-razorpay-signature`, hex→bytes timing-safe compare). Popup/WebView result is UX-only — correct design.
- **Edge functions:** every function derives service role from `Deno.env` — no hardcoded secrets; parchi-ocr + qa-auth-bridge verify caller JWTs via `auth.getUser`.
- **RLS:** all 60+ public tables (incl. the 8 zaffy_* platform tables) have `ENABLE ROW LEVEL SECURITY` + owner policies in migrations. 25/33 migrations carry explicit ROLLBACK headers (by design for RPC-heavy waves).
- **Order tracking:** 30s poll interval properly cleared on unmount; escalation RPC flow intact.
- **i18n:** en/hi/hi-Latn key parity exact (82 keys each).
- **Animated loops:** every `Animated.loop` paired with a stop path; no interval leaks in screens.
- **Tab bar:** all customer/merchant/rider/admin tabs had visuals (except the two fixed above).
- **supabase.ts, worker/index.ts, zaffy.ts, razorpayCheckout.ts, LoginOtpScreen (PR #52), CustomerHomeScreen typewriter (PR #53):** read clean.

## Known non-issues / accepted

- `google_drive/` (145 MB) is gitignored local scratch (design refs, docs) — never committed.
- 3 exhaustive-deps warnings (ProScreen/RiderTasks/UniversalSearch) reviewed: intentional key-narrowing (countdown keyed on phase, mount-only deep-link read). Warning-level, no behavior bug.
- `as any` count in src: 2 (Chrome.tsx surface helper) — harmless.

## LOC risk map audited

CustomerHomeScreen 3919 · AccountComplianceScreen 1727 · zaffy-ai-assistant fn 1577 · CartCheckoutScreen 1206 · WalletScreen 1144 · OrdersAndSupportScreen 1011 · UniversalSearch 681 · OrderTracking 747 · LoginOtpScreen 706 · MerchantAds 705 · plus services, store, navigation, edge functions, all 44 migrations.

## Verification (this PR)

- `npm run typecheck` → 0 errors
- `npx tsc -p packages/shared/tsconfig.json` → 0
- `npm run lint` (eslint 9 flat) → 0 errors, 5 warnings
- `npx expo export --platform web` → OK; bundle contains typewriter + DEMO OTP strings
- Typing harness: `TYPED "doodh aur atta"` → **TYPING_OK**
- Login harness (`LOGIN_TEST=1`): **DEMO CODE VISIBLE** (e.g. 095612)
