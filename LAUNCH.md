# LAUNCH.md

What has to happen between "Phase 4 built" and "live in the stores". Items marked **(owner)** need accounts, money or decisions only the owner can provide.

## 1. Accounts and secrets

| What                         | Where it goes                                                                                                                       | Status                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Hosted Supabase project      | `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` (app), service key (functions only)                                                        | **(owner)**                  |
| Anthropic API key            | `ANTHROPIC_API_KEY` function secret; `ANTHROPIC_MODEL` optional                                                                     | **(owner)**; run `pnpm eval` |
| Postmark inbound             | MX for `INBOUND_EMAIL_DOMAIN`; webhook `https://postmark:<INBOUND_WEBHOOK_SECRET>@<project>.supabase.co/functions/v1/inbound-email` | **(owner)**                  |
| Cron for notifications       | Vault secrets `functions_url` and `cron_secret` (= `CRON_SECRET`), see the Phase 3 migration                                        | **(owner)**                  |
| Expo / EAS                   | `extra.eas.projectId` in `app.json`; `eas.json` (needed by the share extension too)                                                 | **(owner)**                  |
| Apple Developer, Google Play | Bundle ids, signing, Sign in with Apple, Google OAuth client ids                                                                    | **(owner)**                  |
| Web app URL                  | `EXPO_PUBLIC_APP_URL` (client links `/p/<token>` from phones; web uses its own origin)                                              | **(owner)**                  |
| Sentry                       | `EXPO_PUBLIC_SENTRY_DSN`                                                                                                            | **(owner)**                  |
| RevenueCat + Stripe          | See §2. Until then leave `BILLING_MODE` empty in production (upgrades show "open soon")                                             | **(owner)**                  |

Never set `AI_MOCK=1` or `BILLING_MODE=stub` in production.

## 2. Payments (stubbed today)

Limits and plans are real: `subscriptions` + `workspace_usage()` + the client-limit trigger + the AI check in edge functions. Only the purchase is stubbed. To go live:

1. **iOS/Android: RevenueCat.** Add `react-native-purchases` (needs approval), products `pro_monthly` ($12) and `pro_yearly` ($96), entitlement `pro`. App user id = workspace id. The paywall's "Upgrade" calls `Purchases.purchasePackage` instead of the stub.
2. **Web: Stripe Checkout.** `billing` function creates a Checkout Session (`client_reference_id` = workspace id) and returns its URL.
3. **Webhooks** (new functions, `verify_jwt = false`, signature-verified): RevenueCat `INITIAL_PURCHASE / RENEWAL / CANCELLATION / EXPIRATION` and Stripe `checkout.session.completed / customer.subscription.updated / deleted` upsert `subscriptions` (`plan`, `status`, `provider`, `current_period_end`) with the service client. Nothing else changes: the app and limits already read that table.
4. "Restore purchases" button on iOS (App Review requirement) and a "Manage subscription" link to the store / Stripe portal.

## 3. Store assets checklist

- [ ] App name and subtitle. **Check the "Notion 2.0" name with a lawyer first** (Notion is a registered trademark; stores reject confusing names).
- [ ] Icon 1024×1024 (no alpha), adaptive Android icon (foreground + background), splash.
- [ ] Screenshots: iPhone 6.9" and 6.5", iPad if tablet support stays on, Android phone. Suggested set: Today, Dump it → proposal, Review with Accept/Undo, Weekly brief, Client update draft, Invoice.
- [ ] Short and long description, keywords, promo text, support URL, marketing URL (landing page), privacy policy URL.
- [ ] Privacy labels / Data safety: email (account), user content (stored, not used for tracking, not sold), diagnostics (Sentry, no content), no third-party advertising. AI processing by Anthropic as a processor.
- [ ] Permission strings: photo library (screenshots), camera (photo capture), notifications. Microphone is not requested (keyboard dictation).
- [ ] App Review notes + demo account with sample data; explain the share extension and forwarding address.
- [ ] Age rating questionnaire; export compliance (standard HTTPS only).
- [ ] Account deletion inside the app (done: Settings → Delete account) and data export (Settings → Export my data).

## 4. Crash-free audit (target 99.5%+ sessions)

Done in code:

- Root `ErrorBoundary` (Expo Router) on every route: reports to Sentry (tags only, no content) and offers "Try again" instead of a white screen.
- Sentry initialized without blocking startup; no console/UI breadcrumbs, no request bodies, no default PII. Session tracking (crash-free rate) is on by default in `@sentry/react-native`.
- Every AI call has a deterministic fallback; network writes are queued and retried; server rejections refetch and toast instead of throwing.
- Native-only modules (notifications, share intent, file system) sit behind `.native.ts` files so web never loads them.

Still to do before launch **(needs devices)**:

- [ ] Run a release build on a mid-range Android and an older iPhone: cold start < 2s, editor typing/paste, share extension, push tap → deep link, export (iOS share sheet, Android folder picker).
- [ ] Turn on Sentry release health with source maps uploaded from EAS builds; watch crash-free sessions through the beta.
- [ ] TestFlight / internal testing track with 10–20 freelancers for a week.

## 5. Launch metrics

`analytics.launch_metrics` (SQL editor or service role; not exposed through the API) reports: signups, onboarding completion %, median seconds to first accepted proposal, unedited acceptance %, D1/D7/D30 retention, weekly-brief users, Pro workspaces. Per-user detail is in `analytics.user_funnel`. Crash-free rate comes from Sentry.

## 6. Release steps

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm test:db && pnpm test:e2e`; `pnpm eval` with a real key (≥ 90%).
2. `supabase db push` to the hosted project; deploy functions (`supabase functions deploy`) and confirm that bundling picks up `packages/shared` (unverified on hosted).
3. Set function secrets (§1), Vault secrets, Postmark webhook.
4. `eas build` (prebuild runs the share-intent and notifications plugins), submit to TestFlight / internal track.
5. Deploy the web app (`expo export --platform web`) and the landing page (`apps/landing`, static), point "Open the app" links at the web app.
