# Agala — Build & Test Progress

> Smart Grocery List App (Expo + Supabase)
> Last updated: 2025-07-18

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

---

## Next Steps

### 6. Run Database Migrations
- [x] Tables already exist in Supabase (`products` has data, `shopping_list` is empty)
- [x] RLS policies active (anon key returns data scoped correctly)

### 7. Start Dev Server & Test on Device
- [x] Dev server started: `npx expo start --port 8081` (running on port 8081)
- [ ] Open on iOS Simulator (`i`), Android Emulator (`a`), or Expo Go (scan QR)
- [ ] Verify the app loads without crash

### 8. Test Auth Flow
- [ ] Sign up with a test email + password
- [ ] Confirm user appears in Supabase Dashboard → Authentication → Users
- [ ] Sign out, then sign back in
- [ ] Verify session persists after app restart (AsyncStorage)

### 9. Test Shopping List (E2E Data Flow)
- [ ] After sign-in, add an item via `AddProductSheet`
- [ ] Confirm item appears in Supabase → Table Editor → `shopping_list`
- [ ] Check off item in app → verify `purchased_at` timestamp set in DB
- [ ] Open on second device → confirm Realtime sync works

### 10. Deploy Edge Function (Nightly Predictions)
- [ ] Install Supabase CLI: `npm install -g supabase`
- [ ] Deploy: `supabase functions deploy nightly-prediction --no-verify-jwt`
- [ ] Set secrets in Dashboard: `CRON_SECRET`
- [ ] Run `01_schedule_nightly_prediction.sql` to enable pg_cron schedule
- [ ] Test manually: `curl -X POST <function-url>` with auth header

### 11. Add Test Framework
- [ ] Install: `npx expo install jest-expo jest @testing-library/react-native @types/jest -- --save-dev`
- [ ] Add to `package.json`:
  ```json
  "scripts": { "test": "jest" },
  "jest": { "preset": "jest-expo" }
  ```
- [ ] Write unit tests for `shoppingListStore.ts` and `useAuth.ts`
- [ ] Write component tests for `ShoppingListItem` and `AddProductSheet`

### 12. Production Build
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Configure: `eas build:configure`
- [ ] Build iOS: `eas build --platform ios --profile preview`
- [ ] Build Android: `eas build --platform android --profile preview`
- [ ] Test on real devices

### 13. Polish & Ship
- [ ] Add app icon and splash screen assets
- [ ] Configure push notifications (if needed)
- [ ] Set up Sentry error tracking (already in dependencies)
- [ ] Submit to App Store / Google Play via `eas submit`

---

## Architecture Reference

| Layer | Technology |
|-------|-----------|
| Frontend | Expo SDK 54 + React Native 0.81 |
| Navigation | expo-router v6 |
| State | Zustand |
| Backend/DB | Supabase (PostgreSQL + Auth + Realtime) |
| Predictions | Supabase Edge Functions (Deno) |
| Error Tracking | Sentry |
