# Agala — Next Features Plan

> Product roadmap items for upcoming development.
> Last updated: 2026-02-26
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
    - Compute `next_purchase_date = last_purchase_date + frequency_days`. ✅
    - Countdown states: today / tomorrow / in X days / overdue by X days. ✅
    - Progress bar ratio: elapsed days since last purchase ÷ frequency days (clamped 0–100%). ✅
    - **Validation update (2026-02-26)**: next-purchase date and progress now read from a unified effective-cycle source; manual mode always takes precedence over AI-derived history. ✅

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

- [ ] **Cart pricing summary**
  - Add price to all products.
  - Show the total expected cart sum based on the current shopping list.

- [ ] **Single products table + autocomplete**
  - Manage one central DB table for all products.
  - Add product-name autocomplete for users when adding items.

## Notes

- Keep UX minimal and clear.
- Prioritize Hebrew-first labels and RTL behavior in every new screen/component.
