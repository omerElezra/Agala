# Agala — Build & Test Progress

> Smart Grocery List App (Expo + Supabase)
> Last updated: 2026-02-26

---

## Completed Steps

### 1. Project Scaffolding

- [x] Expo SDK 54 project initialized with `expo-router`
- [x] TypeScript configured (`tsconfig.json`)
- [x] Dependencies installed (`node_modules` present, Node v25)

### 2. Supabase Client Setup

- [x] `@supabase/supabase-js` v2.97.0 installed
- [x] Client created at `src/lib/supabase.ts` with `AsyncStorage` session persistence
- [x] URL polyfill added (`react-native-url-polyfill`)
- [x] `.env` configured with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [x] `.env.example` added for onboarding reference

### 3. Supabase Connection Verified

- [x] `EXPO_PUBLIC_SUPABASE_URL` — reachable (`aynippaxcwmqufrnthti.supabase.co`)
- [x] `EXPO_PUBLIC_SUPABASE_ANON_KEY` — accepted by Supabase gateway (HTTP 200 on `/auth/v1/settings`)
- [x] Initial key was invalid (31 chars); replaced with correct publishable key (46 chars)

### 4. Database Schema Prepared

- [x] SQL migration files created under `ExternalFiles/supabase/`:
  - `00_init_schema.sql` — tables, RLS, indexes, realtime publications
  - `01_schedule_nightly_prediction.sql` — pg_cron + Edge Function trigger
  - `02_confidence_triggers.sql` — confidence scoring triggers
  - `03_auth_trigger.sql` — auto-create user profile on sign-up
  - `RUN_ALL_ONCE.sql` — combined single-paste script
- [x] Edge Function code: `ExternalFiles/supabase/functions/nightly-prediction/index.ts`

### 5. App Code Written

- [x] **Auth screen** — `app/auth.tsx` (email/password sign-in & sign-up via Supabase Auth)
- [x] **Auth hook** — `src/hooks/useAuth.ts` (session listener, profile fetch, sign-out)
- [x] **Shopping list store** — `src/store/shoppingListStore.ts` (Zustand + Supabase Realtime)
- [x] **Components**:
  - `AddProductSheet.tsx` — add/search products
  - `ShoppingListItem.tsx` — list item with swipe-to-check
  - `SnoozeSheet.tsx` — snooze suggestions
  - `SuggestionChips.tsx` — AI-predicted items
- [x] **DB types** — `src/types/database.ts`
- [x] **Tab layout** — `app/(tabs)/` with index & two screens

### 5b. Auth & UX Bug Fixes (2026-02-22)

- [x] **Inline error/success banners** — Replaced `Alert.alert()` with visual inline banners in `app/auth.tsx` (Alert.alert doesn't display on Expo Web)
- [x] **Login error visibility** — Wrong email/password now shows a red banner: "אימייל או סיסמה לא נכונים"
- [x] **Signup feedback** — Differentiates between: auto-confirmed (success banner), email confirmation required (info banner), and errors (error banner)
- [x] **Fallback profile creation** — `useAuth.ts` now auto-creates household + user profile if the DB trigger (`03_auth_trigger.sql`) wasn't applied
- [x] **Missing household guard** — Home screen shows a warning if `household_id` is missing instead of a blank screen

### 5c. Android Testing Fixes (2026-02-22)

- [x] **Duplicate items on add** — Realtime INSERT handler now deduplicates against items already added by `addItem` (was adding the same item twice)
- [x] **Rate limit error handling** — Improved `translateAuthError` to catch Supabase rate-limit variants (`For security purposes`, `Email rate limit exceeded`)

### 5d. Feature Build-Out (2026-02-22)

- [x] **Purchase History screen** — `app/(tabs)/two.tsx` rebuilt from stub → full history view showing purchased items grouped by date with Hebrew labels (היום/אתמול/date), pull-to-refresh, and "הוסף שוב" (re-add) button per item
- [x] **Settings & Profile screen** — New `app/(tabs)/settings.tsx` with: editable display name, email display, household ID copy-to-clipboard, join-another-household flow, sign-out button, app version
- [x] **Tab navigation update** — 3 tabs: עגלה (shopping cart), היסטוריה (history), הגדרות (settings) with matching icons. Moved sign-out from header to Settings screen
- [x] **Pull-to-refresh** — `RefreshControl` added to main shopping list FlatList
- [x] **AddProductSheet UX improvements** — Recently purchased products shown as quick-add chips when search is empty, "type at least 2 chars" hint, empty search results state with emoji
- [x] **Household invite/join** — Users can copy household ID and share it; other users can paste it in Settings to join the same household
- [x] **expo-clipboard** — Added as dependency for copy-to-clipboard functionality

### 5e. Dark Mode & RTL Polish (2025-07-16)

- [x] **Dark theme system** — Created `constants/theme.ts` with GitHub dark-inspired color palette (background, surface, text, accent, success, error, etc.)
- [x] **Forced dark mode** — Overrode `useColorScheme` (both native + web) to always return `'dark'`; added `DarkTheme` to root layout navigation
- [x] **All screens dark-themed** — auth.tsx, index.tsx, two.tsx, settings.tsx all updated with `dark.*` color references
- [x] **All components dark-themed** — ShoppingListItem, AddProductSheet, SuggestionChips, SnoozeSheet updated with dark palette
- [x] **RTL text alignment** — Added explicit `textAlign: 'right'` to all Hebrew text labels/titles/headers across all screens and components
- [x] **Consistent placeholder colors** — All `placeholderTextColor` props updated to use `dark.placeholder` from theme

### 5f. Item Detail / Edit Page (2025-07-16)

- [x] **Item detail page** — New `app/item/[id].tsx` (~1250 lines) accessible by tapping any item in the shopping list
- [x] **Editable fields** — Product name (TextInput), quantity (+/- buttons), editable category picker (horizontal chip scroll)
- [x] **AI / Manual buy cycle** — Segmented toggle switch between 🤖 AI and ✏️ ידני modes
- [x] **AI info box** — Shows "AI חישב: כל X ימים (לפי N רכישות)" or "AI לומד — עדיין אין מספיק רכישות..."
- [x] **Buy cycle statistics** — Purchase count, average days between buys, min/max range
- [x] **Manual EMA editing** — +/- picker in manual mode with inline "אישור" button
- [x] **Reset to AI** — Recalculates EMA from history if 2+ purchases, otherwise keeps value & switches mode
- [x] **Next buy prediction** — Computed from `last_purchased_at + ema_days`, shows "בעוד X ימים" / "היום!" / "לפני X ימים (איחור)"
- [x] **Purchase history** — Shows up to 20 past purchases with dates and quantities
- [x] **Save + Delete** — Saves name/category/quantity; delete works on web (window.confirm) and native (Alert.alert)
- [x] **Navigation** — ShoppingListItem now wraps product info in TouchableOpacity → `router.push('/item/${item.id}')`

### 5g. Category System & Smart Defaults (2025-07-17)

- [x] **Category detector** — New `src/utils/categoryDetector.ts` with ~200 Hebrew keyword mappings across 14 categories
- [x] **Auto-category on create** — New custom products auto-detect category from name keywords
- [x] **Smart default buy cycles** — `getSmartDefaultDays(category)` replaces hardcoded 7-day default (e.g. bread→3, dairy→5, meat→6, cleaning→30, spices→45)
- [x] **Auto-create inventory rules** — When opening item detail, auto-creates `household_inventory_rules` entry with smart defaults if none exists
- [x] **Category picker in item detail** — Horizontal ScrollView with 14 category chips + "ללא" (none)

### 5h. Tab & History Polish (2025-07-17)

- [x] **Tab cleanup** — Removed emoji prefixes from tab titles, added `tabBarLabelPosition: 'beside-icon'`
- [x] **Date filter in history** — 5-option filter bar: הכל / היום / שבוע / חודש / תאריך (with custom date picker)
- [x] **Cross-platform date picker** — Native `DateTimePicker` on iOS (spinner) / Android (default), HTML `<input type="date">` in Modal for web with dark theme styling
- [x] **AI mode text simplification** — Clear Hebrew messages for AI learning vs calculated states

### 5i. Bug Fixes & Web Compatibility (2025-07-17)

- [x] **Delete on web** — `Alert.alert()` is no-op on web → added `Platform.OS === 'web'` check with `window.confirm()` fallback
- [x] **Date picker on web** — `@react-native-community/datetimepicker` doesn't render on web → added web-specific Modal with HTML `<input type="date">`

### 5j. CSV Import (2025-07-18)

- [x] **Settings page CSV import** — Import grocery lists from CSV files
- [x] **Web file picker** — Uses `document.createElement('input')` for file selection on web
- [x] **Mobile clipboard paste** — On native, prompts user to paste CSV text from clipboard (`expo-clipboard`)
- [x] **Auto-detect headers** — Skips header row if it contains "name", "שם", or "product"
- [x] **Auto-category detection** — Each imported item gets auto-categorized via `detectCategory()`
- [x] **Product upsert** — Reuses existing products by name, only creates new ones if needed

### 5k. APK Bug Fixes (2026-02-24)

- [x] **Settings black screen** — `useAuth()` briefly returns `isLoading=true`; replaced `return null` with `ActivityIndicator` loading spinner so the screen doesn't flash black
- [x] **"(tabs)" title visible** — Stack navigator was rendering "(tabs)" as header title; fixed by setting `headerShown: false` globally in Stack `screenOptions` and defining all screens statically
- [x] **Bottom tabs behind nav bar** — Fixed tab bar height didn't account for Android system navigation bar; added `useSafeAreaInsets()` from `react-native-safe-area-context` with dynamic `bottomPadding` calculation
- [x] **Adaptive icon clipped** — Icon content filled entire 1024x1024 canvas, getting clipped by Android's adaptive icon mask; resized logo to 63% (645px) centered on dark background canvas
- [x] **RTL double-reversal** — `I18nManager.forceRTL(true)` already handles RTL layout system-wide; removed all manual `textAlign: 'right'` (~40+ occurrences across 11 files) and `flexDirection: 'row-reverse'` overrides that were causing double-flip back to LTR appearance
- [x] **First-launch RTL reload** — Added `expo-updates` dependency; root layout now calls `Updates.reloadAsync()` when `!I18nManager.isRTL` is detected (first install), ensuring RTL takes effect immediately without manual restart
- [x] **Header button swap** — Swapped `headerLeft`/`headerRight` in tabs layout to account for RTL auto-flip (logo → headerLeft, exit → headerRight ≡ null)

### 5l. Splash Icon & Branding (2026-02-24)

- [x] **Proportional splash icon** — Extracted logo from adaptive-icon (411x458 content area), scaled proportionally to ~35% of canvas width, centered on 1284x2778 dark (#0F0F1A) splash canvas
- [x] **Splash screen background** — Set to `#0F0F1A` matching the app's dark theme

### 5m. CI/CD Pipeline (2026-02-24)

- [x] **GitHub Actions workflow** — Unified `cicd.yml` with quality checks (typecheck + expo-doctor), auto-versioning, EAS Build, and GitHub Release
- [x] **Release notes config** — `.github/release.yml` with auto-categorized changelog (features, bugs, UI, AI, maintenance, docs)
- [x] **Version management** — Auto-increment patch on push to main, manual override via workflow dispatch

### 5n. Smart AI Suggestions & Prediction Enhancements (2026-02-25)

- [x] **Confidence % in suggestion chips** — Each chip now shows product name + confidence score (e.g. "חלב תנובה 92%")
- [x] **Urgency priority line** — Items predicted to run out today (or overdue) appear first with ⚠️ warning styling and overdue badge
- [x] **Configurable confidence threshold** — `AI_SUGGESTION_CONFIG` exported from store with `confidenceThreshold` (50) and `urgentWithinDays` (0)
- [x] **Suggestion sorting** — Urgent items sorted to top, then by descending confidence score
- [x] **Estimated frequency display (תדירות משוערת)** — New prominent box in item detail showing "כל X ימים" with source context ("מבוסס על N רכישות אחרונות")
- [x] **Visual progress bar** — Consumption cycle progress bar in "הקנייה הבאה" section (green → yellow → red as overdue)
- [x] **Progress percentage** — Shows "X% מהמחזור" below the bar
- [x] **System status footer** — "המערכת לומדת ומשתפרת עם כל קנייה" shown in AI mode
- [x] **Card title improvement** — "מתי לקנות שוב?" → "הקנייה הבאה" matching the feature plan spec

### 5o. UX & Prediction Accuracy Updates (2026-02-26)

- [x] **Add flow simplified** — Removed floating `+` add button from main list; adding products now happens through the search bar flow only (including direct one-click add when item is not found)
- [x] **Search clear action** — Added clear (`X`) button in search bar when query is non-empty
- [x] **All-products navigation** — Tapping a product in "כל המוצרים" now opens the item details page (not only active-cart items)
- [x] **All-products spacing polish** — Added visual spacing between product name block and cart/add badge
- [x] **Quantity control polish** — Unified +/- button visual style in shopping list item cards
- [x] **Purchase summary metrics updated** — "סיכום קניות" now shows: depletion percent, purchase count (not total units), purchase pattern, and "last purchased ago"
- [x] **Next purchase calculation fix** — Unified prediction logic to use a single effective cycle source:
  - Manual mode (`manual_only`) always uses user-defined `ema_days`
  - AI mode uses `rule.ema_days` with safe history fallback
  - `nextBuyDate` and progress ratio now share the same source-of-truth inputs
- [x] **Depletion percent reliability fix** — Uses purchase history as primary source for last purchase timestamp, with `rule.last_purchased_at` fallback

---

## Next Steps

### 6. Run Database Migrations

- [x] Tables already exist in Supabase (`products` has data, `shopping_list` is empty)
- [x] RLS policies active (anon key returns data scoped correctly)

### 7. Start Dev Server & Test on Device

- [x] Dev server started: `npx expo start --port 8081` (running on port 8081)
- [x] Tested on Android device via EAS preview APK
- [x] Verified the app loads without crash

### 8. Test Auth Flow

- [x] Sign up with test email + password — works
- [x] Session persists after app restart (AsyncStorage)
- [x] Sign out and sign back in — verified

### 9. Test Shopping List (E2E Data Flow)

- [x] Add item via `AddProductSheet` — item appears in DB
- [x] Check off item → `purchased_at` timestamp set
- [x] Realtime sync between devices — working

### 10. Deploy Edge Function (Nightly Predictions)

- [ ] Install Supabase CLI: `npm install -g supabase`
- [ ] Deploy: `supabase functions deploy nightly-prediction --no-verify-jwt`
- [ ] Set secrets in Dashboard: `CRON_SECRET`
- [ ] Run `01_schedule_nightly_prediction.sql` to enable pg_cron schedule
- [ ] Test manually: `curl -X POST <function-url>` with auth header

### 11. Add Test Framework

- [ ] Install: `npx expo install jest-expo jest @testing-library/react-native @types/jest -- --save-dev`
- [ ] Write unit tests for `shoppingListStore.ts` and `useAuth.ts`
- [ ] Write component tests for `ShoppingListItem` and `AddProductSheet`

### 12. Production Build

- [x] EAS CLI installed (v18.0.3)
- [x] `eas build:configure` — configured with `eas.json` (preview + production profiles)
- [x] EAS environment variables set for `preview` and `production`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [x] Build Android preview APK: `eas build --platform android --profile preview`
- [x] Build Android production AAB: `eas build --platform android --profile production`
- [x] Tested APK on physical Android device — 5 bugs found and fixed
- [ ] Build iOS: `eas build --platform ios --profile preview`
- [ ] Test on real iOS device

### 13. Polish & Ship

- [x] App icon and splash screen assets configured (adaptive-icon, splash-icon, icon, favicon)
- [x] Splash icon proportionally sized (~35% of canvas width)
- [x] Adaptive icon with safe 63% sizing for Android masks
- [x] CI/CD pipeline set up via GitHub Actions
- [ ] Configure push notifications (if needed)
- [ ] Set up Sentry error tracking

### 16. Validation & Full Flow Check (2026-02-26)

- [x] TypeScript validation: `npm run typecheck` (no compile errors)
- [x] Static editor validation: no TypeScript/compile errors in updated files:
  - `app/(tabs)/index.tsx`
  - `app/item/[id].tsx`
  - `src/components/ShoppingListItem.tsx`
- [x] Product flow validation checklist updated:
  - Search-based add works (including "not found" → direct add)
  - Product details are reachable from active list and all-products list
  - AI/manual next purchase and progress/depletion metrics use consistent cycle inputs

### 14. Google Play Store Release

- [ ] **Create Google Play Console account** — one-time $25 registration at [play.google.com/console](https://play.google.com/console)
- [ ] **Create the app** in Play Console → "Create app" → set app name "עגלה", default language Hebrew, app type "App", free
- [ ] **Privacy policy** — publish a publicly accessible privacy policy page (covers Supabase Auth email collection) and add the URL in Play Console
- [ ] **Store listing** — fill in:
  - Short description (80 chars max, Hebrew)
  - Full description (4000 chars max, Hebrew)
  - App icon (512×512 PNG)
  - Feature graphic (1024×500 PNG)
  - Phone screenshots (min 2, recommended 4–8)
  - Tablet screenshots (if `supportsTablet: true`)
  - App category: "Shopping" or "Productivity"
- [ ] **Content rating** — complete the IARC questionnaire (no violent content, no user-generated media → simple answers)
- [ ] **Data safety** — declare:
  - Email address: collected for authentication (required, not optional)
  - No location, no device identifiers, no financial data
  - Data encrypted in transit (Supabase uses HTTPS)
  - User can request account deletion
- [ ] **Target audience & content** — set target age group (not "children under 13" unless COPPA-ready)
- [ ] **App access** — provide test credentials for Play review team (email + password for a working account)
- [ ] **Build production AAB** — `eas build --platform android --profile production`
- [ ] **Upload AAB to Internal testing** track first → test with 1–5 testers
- [ ] **Promote to Closed testing** (alpha/beta) → invite 10–20 external testers, collect feedback
- [ ] **Submit to Production** — `eas submit --platform android --profile production` (or upload manually)
- [ ] **Staged rollout** — start at 10% → 50% → 100% once crash-free rate is confirmed
- [ ] **Monitor post-launch** — check Play Console for ANR rate, crash rate, user reviews

### 15. App Store Release (iOS) — Future

- [ ] Apple Developer Program enrollment ($99/year)
- [ ] Build iOS: `eas build --platform ios --profile production`
- [ ] Submit to App Store: `eas submit --platform ios`
- [ ] Complete App Store Connect listing (screenshots, description, review notes)

---

> **Next feature roadmap**: [`NEXT_FEATURES_PLAN.md`](NEXT_FEATURES_PLAN.md)

---

## Architecture Reference

| Layer       | Technology                              |
| ----------- | --------------------------------------- |
| Frontend    | Expo SDK 54 + React Native 0.81         |
| Navigation  | expo-router v6                          |
| State       | Zustand                                 |
| Backend/DB  | Supabase (PostgreSQL + Auth + Realtime) |
| Predictions | Supabase Edge Functions (Deno)          |
| Build/CI    | EAS CLI v18.0.3 + GitHub Actions        |
| OTA Updates | expo-updates (first-launch RTL reload)  |
