# Agala — Build & Test Progress

> Smart Grocery List App (Expo + Supabase)
> Last updated: 2026-03-21

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
  - `SuggestionChips.tsx` — AI-predicted items (replaced by `RecommendationLine.tsx` in Step 5u; component deleted)
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
- [x] **All components dark-themed** — ShoppingListItem, AddProductSheet, SnoozeSheet updated with dark palette
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

### 5p. Navigation, RTL & Visual Alignment Updates (2026-02-27)

- [x] **Global RTL-force removed** — Disabled `I18nManager.allowRTL/forceRTL` flow in root layout; app now relies on explicit per-component alignment/direction styles
- [x] **Status bar visibility fix** — Added global light status-bar style in root layout so battery/clock/icons are visible over dark backgrounds
- [x] **Header consistency polish** — Unified username + exit icon order/style (`exit-run`) and aligned header-side behavior across tabs, modal, and item-details header
- [x] **Item details direction cleanup** — Aligned item-details rows/labels/icons with shopping-list/history behavior to avoid reversed icon/text presentation
- [x] **History date-filter alignment** — Date filter row and labels aligned to RTL/right-oriented presentation
- [x] **Shopping list spacing tweak** — Tightened highlight line/card edge presentation in shopping-list item UI

### 5q. Per-Item Prediction Normalisation & Settings Enhancements (2026-03-01)

- [x] **EMA normalised per 1 item** — All EMA calculations (client-side historyEmaDays, auto-create rule, handleCreateRule AI mode, handleResetToAI, buyCycleStats) now divide each raw purchase interval by the quantity purchased at the start of that interval. `ema_days` always represents a single-unit consumption cycle.
- [x] **Server-side EMA normalisation** — `supabase/functions/nightly-prediction/index.ts` → `recalculateEMA()` now fetches previous purchase quantity and divides `rawIntervalDays / previousQuantity` per iteration. Tracks `previousQuantity` across the purchase loop.
- [x] **Next purchase = ema_days × quantity** — Both client (`nextBuyDate`, `progressRatio`) and server (`evaluateRulesAndAct`) multiply the per-item EMA by `lastPurchaseQuantity` to compute the actual expected interval.
- [x] **UI: "ימים" label, "ליחידה" in description** — AI and manual mode value displays show "כל X ימים" (plain); the subtitle/description line shows "ליחידה" along with purchase count and quantity context.
- [x] **Manual mode subtitle enhancement** — When lastPurchaseQuantity > 1, shows "ליחידה · קנייה אחרונה ×N → Y ימים" (the actual adjusted interval).
- [x] **Stats: total units purchased** — Both AI and manual mode stats sections show `totalQty` (sum of all purchase quantities) with label "יח' נקנו" instead of transaction count.
- [x] **Settings: import section rewrite** — Replaced single CSV import with 3 options: file picker (`expo-document-picker` + `expo-file-system`), clipboard paste, and manual text input area.
- [x] **Settings: Google Play rate button** — Added solid purple "דרגו אותנו ב-Google Play" button with `Linking.openURL('market://details?id=com.omerelezra.agala')`.
- [x] **Settings: all text right-aligned** — Added `textAlign: 'right'` to all relevant style definitions (sectionTitle, label, value, nameInput, householdId, hint, joinInput, csvExampleTitle, csvExampleText) and changed editRow/joinRow to `row-reverse`.
- [x] **Item detail: RTL alignment fix** — `manualEditInline` flexDirection changed to `row-reverse`; miniStatNum and miniStatLabel text aligned right.
- [x] **06_Nightly_Prediction.md** — New comprehensive technical reference document covering per-item EMA algorithm, execution flow, client-side prediction, data flow, edge cases, and environment variables.
- [x] **Documentation updated** — Updated all relevant MD files (03_Prediction_Logic, 04_UX_and_DataFlow, 02_Database_Schema, 00_PRD, README, NEXT_FEATURES_PLAN) to reflect per-item normalisation and new features.

### 5r. Auth UX, Sort & Category Features, RTL & Bug Fixes (2026-03-06)

- [x] **Auth screen visual differentiation** — Login and sign-up modes now have distinct visual styles: different header text/subtitle, logo size (120px login vs 80px signup), and sign-up mode includes a "verify password" (אימות סיסמא) field with matching-password validation
- [x] **Password placeholder fix** — Fixed disappearing "סיסמא" placeholder text by adding `key={password-${mode}}` to force TextInput remount and clearing password state on mode toggle
- [x] **Global RTL force for all devices** — Re-enabled `I18nManager.forceRTL(true)` at module level in `app/_layout.tsx`; added `supportsRTL: true` and `forcesRTL: true` to `app.json` under both `ios` and `android` configs, plus `ios.infoPlist` Hebrew locale
- [x] **Header icon swap (all screens)** — Moved exit+username to `headerRight` and back arrow to `headerLeft` across root layout, tabs layout, two.tsx, and item detail to align with RTL conventions
- [x] **Sort-by feature** — Added sort chips (שם, קטגוריה, שונה לאחרונה) to both shopping cart and all products sections on the main screen, with "שונה לאחרונה" (recent by `added_at`) as the default sort
- [x] **useFocusEffect sort reset** — Sort selection resets to "שונה לאחרונה" every time the main screen gains focus, ensuring consistent default experience
- [x] **All products counter badge** — Added item count badge (e.g., "32") next to the "כל המוצרים" section header
- [x] **Page title change** — Main screen title changed from "הרשימה שלי" to "רשימת הקניות"
- [x] **Product save RLS bug fix (clone-on-edit)** — Fixed silent save failure when editing global products (RLS blocks UPDATE on `is_custom=false` products). New logic detects product ownership; global/foreign products are cloned as custom products and re-linked in the shopping list
- [x] **CategorySheet component** — New `src/components/CategorySheet.tsx` bottom sheet for quick category selection with 16 categories (emoji + Hebrew name), highlighting current selection
- [x] **CategorySheet integration (add-product flow)** — When `detectCategory()` returns null for a new product, the CategorySheet auto-opens to let the user pick a category before product creation. Uses `pendingAddName` state to defer creation until category is selected
- [x] **categoryDetector keywords expanded** — Added missing vegetables: סלק, עלי סלק, חוביזה, עולש, עלי חרדל, ג'רגיר, פול, במיה, חלבלוב, לוביה
- [x] **Settings placeholder color** — Added `placeholderTextColor={dark.placeholder}` to the "הדביקו קוד משק בית" TextInput in settings

### 5s. Category Consolidation & CI Enhancements (2026-03-06)

- [x] **Single source of truth for categories** — Added `CATEGORY_EMOJIS` (Record<string, string>) and `CATEGORIES` ({name, emoji}[]) exports to `src/utils/categoryDetector.ts`. All category data (names, emojis, legacy fallbacks) now lives in one file
- [x] **CategorySheet consolidated** — `src/components/CategorySheet.tsx` now imports `CATEGORIES` from categoryDetector instead of maintaining a hardcoded local `CATEGORY_OPTIONS` array
- [x] **item/[id].tsx consolidated** — Category picker in item detail screen now uses `CATEGORIES` import (with emoji display) instead of plain `CATEGORY_NAMES`
- [x] **index.tsx consolidated** — Removed 35-line hardcoded `CATEGORY_EMOJI` mapping from main screen; now imports shared `CATEGORY_EMOJIS` from categoryDetector
- [x] **Legacy emoji fallbacks** — `CATEGORY_EMOJIS` includes legacy category names (e.g. "בשר ועוף", "מוצרי חלב וביצים") so existing products with old category names still render correct emojis
- [x] **CI: Google Service Account key** — Added "Write Google Service Account key" step to CI workflow that writes `secrets.GOOGLE_SERVICE_ACCOUNT_KEY` to `./google-service-account-key.json` before `eas submit`
- [x] **CI: Hebrew email notification** — Added `dawidd6/action-send-mail@v3` step to release job that sends a Hebrew HTML email with build status, version, and Play Store link on successful release

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

### 5t. Prediction System Fixes & Recommendation Line (2026-03-16/17)

- [x] **Recommendation Line component** — New `src/components/RecommendationLine.tsx` horizontal FlatList showing products due within 3 days with urgency color coding (overdue=red, due-soon=yellow, upcoming=green)
- [x] **Add + Skip buttons per card** — Each recommendation card has "🛒 הוסף" (add to cart) and "דלג" (skip) buttons instead of single-tap card
- [x] **Animated card dismissal** — Cards fade out (opacity 1→0) and scale down (1→0.85) over 250ms on button press using React Native Animated API
- [x] **Instant replacement from candidate pool** — Store maintains `_allRecCandidates` (full sorted pool) and `_skippedRecIds` (session skips); visible recommendations are always top 5 from remaining pool
- [x] **`acceptRecommendation` action** — Adds item to cart, removes from candidate pool, instantly refreshes visible list
- [x] **`skipRecommendation` action** — Tracks skipped product ID in session set, removes from pool, instantly refreshes
- [x] **Recommendation filter: purchased-only** — Changed from exclusion logic (`!activeProductIds.has`) to inclusion (`purchasedProductIds.has`) — only items in "All Items" section (status='purchased') can appear as recommendations
- [x] **Reactivate item refreshes recs** — When adding an item from "All Items" to cart via `reactivateItem`, recommendations instantly update (item no longer in purchased set)
- [x] **Purchase history + inventory rule creation** — `checkOffItem` now creates `purchase_history` entry AND updates `last_purchased_at` on existing `household_inventory_rules` (previously only created new rules, never updated existing ones)
- [x] **Optimistic prediction dot reset** — Checking off an item instantly sets its `predictionStatusMap` entry to "normal" (no dot) before any DB call
- [x] **Optimistic recommendation removal on purchase** — Checking off an item removes it from `_allRecCandidates` and `recommendations` immediately
- [x] **Clock-aware dot calculation** — `fetchRecommendations` now uses `Math.max(rule.last_purchased_at, item.purchased_at)` to compute `lastDate`, ensuring recently purchased items always show correct dot color even if the DB rule update is slow
- [x] **Backfill migration fix** — Fixed stray `§` character in SQL that caused silent syntax error; rewrote with `DO $$` diagnostic blocks showing BEFORE/AFTER table counts via `RAISE NOTICE`
- [x] **Client-side `activeProductIds` filter bug** — Fixed recommendation fetching to only exclude `status='active'` items (was excluding ALL items including purchased)

### 5u. AI Recommendations, Depletion Tracking, Voice Input & UX Overhaul (2026-03-17)

- [x] See previous entries above.

### 5v. Critical Bug Fixes, Household Invites & QA Infrastructure (2026-03-21)

- [x] **🔴 Search bar add-item crash fixed** — Root cause: recommendations row in `listData` prevented `ListEmptyComponent` from rendering (FlatList always had ≥1 item). Fix: conditional render — not-found UI rendered outside FlatList; recommendations hidden during search via `isSearching` flag. Prevents Fabric `addViewAt` crash on Fabric renderer.
- [x] **Household invite system** — Full overhaul of the household joining flow:
  - New `household_invites` table (`code` TEXT UNIQUE, `household_id`, `created_by`, `expires_at`, `uses_remaining`)
  - `households.name` column added — editable from Settings
  - `join_household_by_code(invite_code)` RPC (SECURITY DEFINER) — validates invite, checks `ALREADY_MEMBER`, updates `users.household_id`, decrements uses
  - `leave_household()` RPC (SECURITY DEFINER) — creates new solo household atomically, bypasses RLS INSERT restriction on `households`
  - Short 6-char alphanumeric invite codes (excludes 0/O/1/I for readability)
  - Native share sheet via `Share.share()` with pre-formatted Hebrew message
  - No-restart join/leave — `refreshProfile()` triggers data reload via `useEffect([user?.household_id])`
  - Member list displayed in Settings with (את/ה) marker
  - Solo-leave blocked client-side; 2+ member leave requires confirmation
  - `ALREADY_MEMBER` guard in DB prevents self-joining
- [x] **Settings UI redesign (household section)** — Replaced UUID copy/paste with invite code UI: household name (editable), invite code (create/copy/share), member list, improved join input (`autoCapitalize="characters"`, max 8 chars)
- [x] **TypeScript DB types updated** — Added `households.name`, `household_invites` table, `join_household_by_code` RPC, `leave_household` RPC to `src/types/database.ts`
- [x] **QA Checklist + Skill** — Created `QA_CHECKLIST.md` with Quick Smoke Test and Full Release checklist; `.copilot/skills/agala-qa-checklist/SKILL.md` maps changed files to relevant QA sections
- [x] **Migrations** — `supabase/migrations/20260318_household_invites.sql`, `supabase/migrations/20260321_leave_household_rpc.sql`

- [x] **Safe area / edge-to-edge display fix** — Installed `expo-system-ui` (root background `#0F0F1A`) + `expo-navigation-bar` (transparent, absolute). Root `_layout.tsx` sets `NavigationBar.setBackgroundColorAsync("transparent")` + light buttons. Removed double bottom inset from tab screens (`edges={[]}` instead of `edges={["bottom"]}`) since tab bar already adds `insets.bottom`. Import sheet uses dynamic `paddingBottom: Math.max(32, insets.bottom + 16)` for proper edge-to-edge spacing.

- [x] **RecommendationLine component** — New `src/components/RecommendationLine.tsx` with horizontal scrollable cards, urgency color coding (red/orange/yellow), animated card dismissal (fade + scale), and instant replacement from candidate pool
- [x] **Depletion % display in catalog** — Each "All Items" card shows consumption depletion percentage with Hebrew urgency labels ("לך תקנה", "תכף נגמר", "חצי קלאץ'", "יש, אל תדאג", "יש בשפע", "הרגע קנינו") and color indicators (red/orange/yellow)
- [x] **Depletion sort mode** — New "עומד להיגמר" sort option in catalog; highest depletion sorted first, items without data sink to bottom
- [x] **Sort direction toggle** — Tapping already-active sort chip toggles ascending/descending; arrow indicators (↑/↓) shown on active chip; resets to ascending on screen focus
- [x] **Collapsible sections** — Both "עגלה שלי" and "הקטלוג שלי" sections can be collapsed/expanded with tap on header (▲/▼ toggle arrows)
- [x] **Centered section headers** — Both section titles rendered with decorative horizontal lines (── title ──)
- [x] **Sticky pinned headers** — Cart and catalog headers pin to top while scrolling their respective items via `stickyHeaderIndices` on FlatList
- [x] **Voice input hook** — New `src/hooks/useSpeechRecognition.ts` using `expo-speech-recognition` for Hebrew speech-to-text with graceful fallback
- [x] **App settings store** — New `src/store/appSettingsStore.ts` (Zustand + AsyncStorage) with toggles: `showRecommendations`, `showDepletion`, `autoAddEnabled`
- [x] **Settings AI branding** — Settings toggles renamed with AI branding: "🤖 AI מזהה מה חסר", "מד מלאי בקטלוג", "🤖 AI ממלא את העגלה"
- [x] **WhatsNewModal component** — New `src/components/WhatsNewModal.tsx` for in-app changelog display on version update
- [x] **Category detector expansion** — Enhanced keyword mappings, consolidated exports (`CATEGORY_EMOJIS`, `CATEGORIES`)
- [x] **Prediction dots removed from catalog** — Replaced with depletion % and status labels; dots (`predictionStatusMap`) no longer displayed
- [x] **Catalog renamed** — "כל המוצרים" → "הקטלוג שלי"
- [x] **Font size adjustments** — Product name (14→16) and category subtitle (10→12) in catalog cards
- [x] **Sort chip size reduction** — Reduced padding and font size for sort chips to prevent overflow
- [x] **DB migration: legacy category normalization** — `20260315_normalize_legacy_categories.sql` maps old category names to official 16-category standard
- [x] **DB migration: backfill inventory rules** — `20260316_backfill_inventory_rules.sql` seeds purchase history and inventory rules from existing data
- [x] **Legacy category fix script** — `scripts/fix_legacy_categories.py` for ad-hoc category normalization
- [x] **SuggestionChips fully removed** — Deleted orphaned `SuggestionChips.tsx` component; removed `SuggestionItem` interface, `AI_SUGGESTION_CONFIG`, `fetchSuggestions`, and `acceptSuggestion` from store
- [x] **All suggestion→recommendation references updated** — Updated 9 files across docs, nightly-prediction functions, and store code to use "recommendation" terminology consistently
- [x] **Documentation alignment audit** — Verified all 17 MD files against codebase; fixed "כל המוצרים" → "הקטלוג שלי", prediction dots → depletion labels, and updated component tree in DEVELOPMENT.md

---

## Next Steps

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

- [x] **Create Google Play Console account** — one-time $25 registration at [play.google.com/console](https://play.google.com/console) ✅
- [x] **Create the app** in Play Console → "Create app" → set app name "עגלה", default language Hebrew, app type "App", free ✅
- [ ] **Privacy policy** — publish a publicly accessible privacy policy page (covers Supabase Auth email collection) and add the URL in Play Console
- [ ] **Store listing** — fill in:
  - Short description (80 chars max, Hebrew)
  - Full description (4000 chars max, Hebrew)
  - App icon (512×512 PNG) ✅ Added `assets/store_listing/store-icon-512.png`
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

### 14b. Google Play Auto-Submit Setup (2026-03-02)

- [x] **EAS Submit config** — Added `submit.production.android` to `eas.json` with `serviceAccountKeyPath` and `track: internal`
- [x] **CI/CD auto-submit step** — Added `eas submit --platform android --profile production --latest` step to GitHub Actions workflow (runs after successful EAS build)
- [x] **Store icon asset** — Created `assets/store_listing/store-icon-512.png` (512×512 PNG) for Play Console listing
- [ ] **Google Service Account key** — Pending: create service account in Google Cloud Console, grant Play Console API access, download JSON key, add as `google-service-account-key.json` (or EAS secret)

### 15. App Store Release (iOS) — Future

- [ ] Apple Developer Program enrollment ($99/year)
- [ ] Build iOS: `eas build --platform ios --profile production`
- [ ] Submit to App Store: `eas submit --platform ios`
- [ ] Complete App Store Connect listing (screenshots, description, review notes)

### 16. Auto Release Notes (GitHub + Google Play + In-App)

- [x] **Release notes generator script** — `scripts/generate-release-notes.js` parses git log, maps conventional-commit prefixes to Hebrew categories (✨ תכונות חדשות, 🐛 תיקוני באגים, 🎨 עיצוב, 🧠 חיזוי, etc.), outputs `whatsnew/he-IL` + JSON
- [x] **GitHub Releases** — already configured: `generate_release_notes: true` + `.github/release.yml` with 7 label categories
- [x] **Google Play release notes** — `whatsnew/he-IL` auto-generated in CI before `eas submit`; EAS Submit picks it up automatically
- [x] **CI email — dynamic notes** — Release notification email now uses `${{ steps.notes.outputs.html }}` instead of hardcoded text
- [x] **In-app "מה חדש" modal** — `src/components/WhatsNewModal.tsx` fetches GitHub Releases API on launch, compares `app.json` version to AsyncStorage `lastSeenVersion`, parses markdown body into Hebrew sections, shows once per version
- [x] **Wired into layout** — `WhatsNewModal` rendered in `app/_layout.tsx` after auth (only when logged in)

---

> **Next feature roadmap**: [`NEXT_FEATURES_PLAN.md`](NEXT_FEATURES_PLAN.md)

---

### 17. Critical Bug Fixes + Household Invites Overhaul (v1.0.11, 2026-03-21)

- [x] **Search add-item crash fixed** — `app/(tabs)/index.tsx`
  - Root cause: recommendations row in `listData` prevented `ListEmptyComponent` rendering
  - Fix: conditional render — not-found UI outside FlatList; recommendations hidden during search
  - Prevents Fabric `addViewAt` crash on Fabric renderer (React Native New Architecture)
- [x] **Household invite system** — `app/(tabs)/settings.tsx` + 2 SQL migrations
  - `households.name` — editable household name, shown in invite message
  - `household_invites` table — 6-char alphanumeric code, 7-day expiry, 10 uses per invite
  - `join_household_by_code()` RPC (SECURITY DEFINER) — validates invite, guards `ALREADY_MEMBER`, updates `users.household_id`, decrements uses atomically
  - `leave_household()` RPC (SECURITY DEFINER) — creates new solo household, bypasses RLS INSERT restriction
  - Settings UI: household name edit, invite code generate + copy + share (native share sheet), members list, short-code join input, leave household button
  - No-restart join/leave — `refreshProfile()` + data reload after every household change
  - Solo-leave guard — blocked client-side when already the only member
- [x] **TypeScript types updated** — `src/types/database.ts`
  - Added `households.name`, `household_invites` table, `join_household_by_code` and `leave_household` RPCs
- [x] **QA checklist updated** — household scenarios added to §7 Settings; household join bug marked Fixed
- [x] **Skills created/updated** — `push-changes`, `pr-release-summary`, `agala-qa-checklist`

### Step 5x — Add-Item Destination Toggle, CI Email Redesign, Bug Fixes (2026-03-22)

- [x] **Add-item destination toggle** — `app/(tabs)/index.tsx`
  - Segmented toggle in not-found overlay: "לקטלוג" (catalog) vs "לעגלה" (cart)
  - Default: catalog. Button color/label changes dynamically (purple=catalog, green=cart)
  - Works in both direct add and CategorySheet pending-add flow; resets after each add
  - Moved not-found overlay to top of screen (`justifyContent: flex-start`, `paddingTop: 32`) so keyboard doesn't hide it
- [x] **CI email notification redesign** — `.github/workflows/cicd.yml`
  - Table-based HTML layout for cross-client compatibility (Gmail, Outlook, Apple Mail)
  - Gradient header banner, version badge pill, green status bar, bordered "What's New" section
  - Purple CTA button, GitHub Release link, matching app theme colors, full RTL + `lang="he"`
- [x] **Inventory rule upsert fix** — `src/store/shoppingListStore.ts`
  - Changed `household_inventory_rules` `.insert()` to `.upsert({ onConflict: "household_id,product_id" })`
  - Fixes "duplicate key" error when buying an item that already has an inventory rule
  - Applied to both `checkOffItem` and `addItem` code paths
- [x] **Stock % inversion** — `shoppingListStore.ts`, `index.tsx`, docs
  - 0% = empty, 100% = full (inverted from previous depletion model)
  - 6-tier Hebrew labels: לך תקנה / תכף נגמר / חצי קלאץ' / יש אל תדאג / יש בשפע / הרגע קנינו
  - Sort by low-stock-first in "עומד להיגמר" mode
- [x] **Voice auto-stop** — `useSpeechRecognition.ts`, `index.tsx`
  - Silence/final-result timers auto-stop recording in both search and multi-add flows
- [x] **What's New dual-track** — `WhatsNewModal.tsx`, `generate-release-notes.js`, `cicd.yml`
  - Hebrew in-app popup from `app.json` extras; English GitHub Release unchanged

---

## Architecture Reference

| Layer       | Technology                                |
| ----------- | ----------------------------------------- |
| Frontend    | Expo SDK 54 + React Native 0.81           |
| Navigation  | expo-router v6                            |
| State       | Zustand                                   |
| Backend/DB  | Supabase (PostgreSQL + Auth + Realtime)   |
| Predictions | Supabase Edge Functions (Deno)            |
| Build/CI    | EAS CLI v18.0.3 + GitHub Actions          |
| Submit      | EAS Submit → Google Play (internal track) |
| OTA Updates | expo-updates (first-launch RTL reload)    |
