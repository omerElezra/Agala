# Agala — Next Features Plan

> Product roadmap items for upcoming development.
> Last updated: 2026-03-17
> Status: Active development

## Planned Features

- [x] **Purchase Prediction Module (חיזוי קנייה)** ✅ Implemented (Step 5f + 5n)
  - **Location**: Product details screen.
  - **Mode toggle**: Switch between `AI` and `ידני` (Manual). ✅
  - **Estimated Frequency (תדירות משוערת)**: ✅
    - Show readable value (example: `כל 5 ימים`). ✅
    - Show subtitle with source context (example: `מבוסס על 12 רכישות אחרונות`). ✅
  - **Next Purchase Indicator (הקנייה הבאה)**: ✅
    - Show countdown text (example: `בעוד יומיים`). ✅
    - Show exact projected date + weekday. ✅
    - Include a visual progress bar for current consumption cycle. ✅
  - **System status footer**: ✅
    - `המערכת לומדת ומשתפרת עם כל קנייה`. ✅
  - **Logic rules**: ✅
    - In `AI` mode, calculate frequency from purchase history intervals (prefer recent purchases). ✅
    - In `ידני` mode, use user-defined frequency days. ✅
    - Compute `next_purchase_date = last_purchase_date + frequency_days × quantity`. ✅
    - `ema_days` is always per 1 item; intervals normalised by purchase quantity. ✅
    - Countdown states: today / tomorrow / in X days / overdue by X days. ✅
    - Progress bar ratio: elapsed days since last purchase ÷ frequency days (clamped 0–100%). ✅
    - **Validation update (2026-02-26)**: next-purchase date and progress now read from a unified effective-cycle source; manual mode always takes precedence over AI-derived history. ✅
    - **Per-item normalisation (2026-03-01)**: all EMA calculations divide raw intervals by quantity so `ema_days` is always per 1 item. Client + server aligned. UI shows "ימים" with "ליחידה" in description. ✅

- [x] **Settings Enhancements** ✅ Implemented (Step 5q)
  - **Import rewrite**: 3 options — file picker, clipboard paste, manual text input. ✅
  - **Google Play rate button**: Opens Play Store listing. ✅
  - **Full RTL alignment**: All settings text right-aligned. ✅
  - **Placeholder color**: Household join code input uses proper `dark.placeholder` color. ✅

- [x] **Sort & Filter on Main Screen** ✅ Implemented (Step 5r)
  - **Sort chips**: Name (שם), Category (קטגוריה), Recent (שונה לאחרונה) — applied to both cart and all-products sections. ✅
  - **Default sort**: "שונה לאחרונה" (by `added_at` newest-first) is the default on every screen focus. ✅
  - **useFocusEffect reset**: Sort selection resets automatically when the screen gains focus. ✅
  - **All products counter**: Item count badge displayed next to "הקטלוג שלי" header. ✅

- [x] **Auth Screen Polish** ✅ Implemented (Step 5r)
  - **Visual differentiation**: Login and sign-up have distinct headers, logo sizes, and form fields. ✅
  - **Verify password**: Sign-up mode includes password confirmation field with validation. ✅
  - **Placeholder fix**: Password placeholder no longer disappears on mode toggle (key-based remount). ✅

- [x] **Category Selection Sheet** ✅ Implemented (Step 5r + 5s)
  - **CategorySheet component**: Bottom sheet with 16 categories (emoji + name), highlighting current selection. ✅
  - **New product flow**: When category can't be auto-detected, user picks category before creation. ✅
  - **Category detector expanded**: Added 10+ missing Hebrew vegetable keywords. ✅
  - **Single source of truth**: All category data (names, emojis, legacy mappings) consolidated into `categoryDetector.ts` exports (`CATEGORY_EMOJIS`, `CATEGORIES`). No more hardcoded duplicates across components. ✅

- [x] **Product Save Bug Fix (Clone-on-Edit)** ✅ Implemented (Step 5r)
  - **RLS-safe editing**: Global products are cloned as custom products when edited, preventing silent RLS failures. ✅
  - **Shopping list re-linking**: Cloned product is automatically linked to the existing shopping list item. ✅

- [x] **Smart AI Suggestions Module (הצעות AI חכמות)** ✅ Implemented (Step 5n)
  - **Location**: Main shopping list screen, directly below search bar. ✅
  - **Dynamic suggestion chips**: ✅
    - Horizontal scroll list of high-likelihood products. ✅
    - Show product name + confidence percent in each chip. ✅
  - **Confidence display**: ✅
    - Examples: `חלב תנובה 92%`, `ביצים L 85%`. ✅
  - **Logic rules**: ✅
    - Rank suggestions by descending confidence score. ✅
    - Show only items above configured confidence threshold (`AI_SUGGESTION_CONFIG.confidenceThreshold`). ✅
    - Keep items predicted to run out by today as a single priority line at the top. ✅
    - Refresh scores when purchases are completed or list state changes. ✅

- [x] **Recommended Prediction Line in Shopping List (שורת המלצות)** ✅ Implemented (2026-03-16)
  - **Location**: Main shopping list screen, between search bar and cart section.
  - Horizontal FlatList of recommended product cards with urgency color coding (red=overdue, yellow=due-soon, green=upcoming).
  - Each card shows: product name, colored dot, urgency label ("איחור X ימים" / "היום" / "מחר" / "עוד X ימים").
  - **Two action buttons per card**: 🛒 הוסף (add to cart) and דלג (skip).
  - **Animated transitions**: Cards fade out (opacity 1→0) and scale down (1→0.85) over 250ms on button press.
  - **Instant replacement**: Removed items are instantly replaced from a pre-sorted candidate pool — no refresh required.
  - **Smart filtering**: Only shows items from "All Items" (status='purchased'), never from the active cart.
  - **Synced with cart actions**: Adding an item from "All Items" to cart immediately removes it from recommendations.
  - **Purchase resets predictions**: Checking off an item instantly sets its dot to "normal" and removes it from recommendations.
  - **Candidate pool stored in state**: `_allRecCandidates` holds all eligible items; `_skippedRecIds` tracks session skips.
  - **Data source**: `household_inventory_rules` with `ema_days > 0` and `last_purchased_at` set, filtered to `daysLeft <= 3`.

- [ ] **Cart pricing summary**
  - Add price to all products.
  - Show the total expected cart sum based on the current shopping list.

- [ ] **Single products table + autocomplete**
  - Manage one central DB table for all products.
  - Add product-name autocomplete for users when adding items.

- [x] **Android versionCode** ✅ Implemented
  - Added `versionCode: 3` to `app.json` → `android` section (required for Google Play uploads).
  - Added explicit `permissions: ["INTERNET", "VIBRATE"]` to prevent unwanted default permissions.

- [x] **In-App Review (Native Rating Dialog)** ✅ Implemented
  - Installed `expo-store-review` and added plugin to `app.json`.
  - Settings "דרגו אותנו" button now triggers the **native** Google Play review sheet (no redirect).
  - Fallback: opens Play Store page if native review is unavailable.

- [ ] **Analytics & Crash Reporting (ניטור קריסות)**
  - Integrate Sentry (`sentry-expo`) or Firebase Crashlytics for production error monitoring.
  - Track key user events: sign-up, item added, purchase marked, AI suggestion accepted.

- [ ] **Push Notifications (התראות דחיפה)**
  - Add `expo-notifications` + Firebase Cloud Messaging (FCM).
  - Notify household members when items are added / checked off.
  - Notify when the nightly prediction adds items automatically.

- [ ] **Deep Linking for Household Invites (הזמנה בקישור)**
  - Replace manual code copy-paste with sharable link (`agala.app/join/<household_id>`).
  - Configure Android App Links + Universal Links (iOS).
  - Recipient taps link → app opens → auto-joins household.

- [x] **Public Privacy Policy URL (כתובת מדיניות פרטיות)** ✅ Implemented
  - Host `PRIVACY_POLICY.md` as a live web page (GitHub Pages / static site).
  - Required by Google Play Console before publishing.
  - Link it from Settings screen and from the Store Listing.

- [x] **Smart Category Auto-Detection (זיהוי קטגוריה חכם)** ✅ Implemented (Step 5u)
  - Auto-detect category for new items using expanded keyword mappings in `categoryDetector.ts`. ✅
  - DB-based fallback and CategorySheet prompt when undetected. ✅
  - All categories consolidated to single source of truth (`CATEGORY_EMOJIS`, `CATEGORIES`). ✅

- [x] **Upgrade App from Settings (עדכון אפליקציה)** ✅ Implemented
  - Added "בדיקת עדכון אפליקציה" button in the settings page.
  - Compares current app version against latest GitHub release tag.
  - If newer version exists → shows banner + opens Play Store.
  - If up to date → shows success banner.
  - Fallback on error: opens Play Store directly so user can check manually.

- [ ] **Add-Item Default Behavior Preference (העדפת הוספת מוצר)**
  - Add preference in Settings to choose default behavior: add to product list or shopping cart.
  - Integrate with existing `showAddToCartOption` setting.

- [x] **Search Bar Add-Item Options Icon (אפשרויות חיפוש)** ✅ Implemented
  - Added a bulk-import icon (list icon with teal border) on the left side of the search bar.
  - Opens a bottom sheet modal with 3 import options: file picker, clipboard paste, manual text input.
  - Same import logic as the Settings import — parses lines of "name" or "name,quantity".
  - Results shown in a popup overlay with success/error feedback.

## Notes

- Keep UX minimal and clear.
- Prioritize Hebrew-first labels and RTL behavior in every new screen/component.

## Revisit & Improve (Post-Launch)

- [ ] **Prediction Flow Accuracy Revisit**
  - Validate that `last_purchased_at` in `household_inventory_rules` is always updated on purchase (currently fixed in `checkOffItem`).
  - Monitor whether the combined `Math.max(rule.last_purchased_at, item.purchased_at)` approach for dot calculation stays accurate as more data accumulates.
  - Consider computing `daysLeft` server-side in the nightly function and storing it in the rule row to avoid client/server drift.
  - Evaluate if `ema_days = 7` default from backfill causes incorrect dots for items with very different real cycles.

- [ ] **Recommendation Engine Refinements**
  - Consider adding a "snooze" option per recommendation (in addition to skip) with a configurable delay.
  - Track skip frequency — if a product is frequently skipped, lower its confidence score.
  - Add "reason" context to recommendations (e.g., "last bought 10 days ago, cycle is 7 days").
  - Consider widening the recommendation window from 3 days to configurable (user preference).

- [x] **Suggestion Chips Pipeline** ✅ Archived (replaced by Recommendation Line in Step 5t/5u)
  - SuggestionChips component replaced by RecommendationLine with depletion-based recommendations.
  - Recommendation engine now uses `fetchRecommendations()` with depletion % calculation instead of confidence-score-based suggestion chips.

- [ ] **Purchase History Completeness Audit**
  - Verify all purchase paths write to `purchase_history` (checkOffItem, addItem with status='purchased', nightly auto-add).
  - Consider adding a migration that reconciles `purchase_history` with `shopping_list` status changes periodically.

- [ ] **Prediction Dot Colors UX Review**
  - Dots replaced by depletion % labels in Step 5u ("לך תקנה", "תכף נגמר", etc.) with colored indicators.
  - Gather user feedback on whether the 6-tier label system is clear enough.
  - Consider adding a legend or tooltip explaining what each label means.
  - Depletion display is toggle-able via Settings → "מד מלאי בקטלוג".
