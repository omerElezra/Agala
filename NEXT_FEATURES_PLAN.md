# Agala — Next Features Plan

> Product roadmap items for upcoming development.
> Last updated: 2026-03-01
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

- [ ] **Recommended Prediction Line in Shopping List (שורת המלצות)**
  - **Location**: Main shopping list screen, above or below the active cart section.
  - Add a dedicated "recommended" row/section showing products the nightly prediction engine flagged as due soon.
  - Each recommended item shows product name + predicted days until needed.
  - One-tap "+" to add the recommended item directly to the active shopping list.
  - Dismissing a recommendation applies a confidence penalty (similar to snooze).
  - Automatically hides items already in the active list.

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

- [ ] **Public Privacy Policy URL (כתובת מדיניות פרטיות)**
  - Host `PRIVACY_POLICY.md` as a live web page (GitHub Pages / static site).
  - Required by Google Play Console before publishing.
  - Link it from Settings screen and from the Store Listing.

## Notes

- Keep UX minimal and clear.
- Prioritize Hebrew-first labels and RTL behavior in every new screen/component.
