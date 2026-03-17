# Agala — Application Flows & Mechanisms

> Complete reference for all data flows, business rules, DB read/write operations,
> and UI state transitions in the Agala smart grocery list app.
>
> Last updated: 2026-03-17

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tables & Their Roles](#2-tables--their-roles)
3. [Flow 1: User Signup & Household Creation](#3-flow-1-user-signup--household-creation)
4. [Flow 2: Adding a Product](#4-flow-2-adding-a-product)
5. [Flow 3: Checking Off an Item (Purchase)](#5-flow-3-checking-off-an-item-purchase)
6. [Flow 4: Reactivating an Item (Catalog → Cart)](#6-flow-4-reactivating-an-item-all-items--cart)
7. [Flow 5: Snooze / Delete Item](#7-flow-5-snooze--delete-item)
8. [Flow 6: Nightly Prediction Engine](#8-flow-6-nightly-prediction-engine)
9. [Flow 7: Recommendation Line (Client-Side)](#9-flow-7-recommendation-line-client-side)
10. [Flow 8: Suggestion Chips (Archived)](#10-flow-8-suggestion-chips-archived)
11. [Flow 9: Depletion Tracking & Status Labels](#11-flow-9-depletion-tracking--status-labels)
12. [Flow 10: Realtime Sync](#12-flow-10-realtime-sync)
13. [EMA Algorithm Reference](#13-ema-algorithm-reference)
14. [Confidence Score State Machine](#14-confidence-score-state-machine)
15. [Known Edge Cases & Decisions](#15-known-edge-cases--decisions)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Expo / React Native App                             │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Zustand      │  │ Components   │  │ Hooks      │ │
│  │ Store        │  │ (UI)         │  │ (useAuth)  │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                 │        │
│         └────────┬────────┘                 │        │
│                  │                          │        │
└──────────────────┼──────────────────────────┼────────┘
                   │ Supabase JS Client       │
                   ▼                          ▼
┌─────────────────────────────────────────────────────┐
│  Supabase Backend                                    │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │PostgreSQL │  │ Realtime  │  │ Edge Functions   │ │
│  │ + RLS     │  │ WebSocket │  │ (nightly-predict)│ │
│  └──────────┘  └───────────┘  └──────────────────┘ │
│  ┌──────────┐  ┌───────────┐                        │
│  │ Auth     │  │ pg_cron   │                        │
│  └──────────┘  └───────────┘                        │
└─────────────────────────────────────────────────────┘
```

**Key principle**: All data is scoped to a `household_id`. RLS enforces this via `get_my_household_id()` → `auth.uid()`.

---

## 2. Tables & Their Roles

| Table                       | Purpose                           | Write Frequency           | Read By                            |
| --------------------------- | --------------------------------- | ------------------------- | ---------------------------------- |
| `households`                | Multi-tenant boundary             | Once (on signup)          | Auth trigger                       |
| `users`                     | Identity + household link         | Once (on signup)          | Auth hook                          |
| `products`                  | Product catalog (global + custom) | On new product add        | Search, list display               |
| `shopping_list`             | Active cart + all items           | Every add/purchase/snooze | Main screen, realtime              |
| `purchase_history`          | Immutable purchase ledger         | Every purchase (checkOff) | Nightly prediction, item detail    |
| `household_inventory_rules` | AI prediction state per product   | On purchase + nightly     | Recommendations, dots, suggestions |

---

## 3. Flow 1: User Signup & Household Creation

```
User submits email + password
    │
    ▼
Supabase Auth creates auth.users row
    │
    ▼
DB Trigger: handle_new_user() [SECURITY DEFINER]
    ├── INSERT INTO households → new household_id
    └── INSERT INTO users (id, household_id, email)
    │
    ▼
Client: useAuth() detects session
    └── Fetches user profile (household_id)
         └── Redirects to home screen
```

**DB Operations:**

- **Write**: `households` (1 row), `users` (1 row)
- **Read**: `users` (profile fetch by auth.uid)

---

## 4. Flow 2: Adding a Product

### 4a. Adding via Search (new product to cart)

```
User types product name in search bar
    │
    ▼
supabase.from('products').select().ilike('name', '%query%')
    │
    ├── Found? → Use existing product row
    │
    └── Not found?
         ├── detectCategory(name) → auto-detect from keywords
         │    ├── Category found → create product directly
         │    └── Category null → open CategorySheet for user to pick
         │
         └── INSERT INTO products (name, category, is_custom, created_by_household)
    │
    ▼
addItem(productId, householdId, quantity, product, toCart=true)
    │
    ├── Optimistic: add to items[] array in Zustand store
    │
    └── INSERT INTO shopping_list
         (household_id, product_id, quantity, status='active')
    │
    ▼
Realtime push → other household members see the item
```

### 4b. Adding from "All Items" (reactivate to cart)

See [Flow 4](#6-flow-4-reactivating-an-item-all-items--cart).

**DB Operations:**

- **Read**: `products` (search query)
- **Write**: `products` (if new), `shopping_list` (new item)

---

## 5. Flow 3: Checking Off an Item (Purchase)

This is the most critical flow — it feeds the AI prediction engine.

```
User taps checkmark on active cart item
    │
    ▼
checkOffItem(itemId) — synchronous optimistic updates:
    │
    ├── 1. item.status → 'purchased', purchased_at → now()
    │      (items array updated in Zustand)
    │
    ├── 2. predictionStatusMap[product_id] → 'normal'
    │      (dot color removed immediately)
    │
    └── 3. Remove product from _allRecCandidates + recommendations
           (recommendation card disappears immediately)
    │
    ▼
Async DB operations (fire-and-forget):
    │
    ├── UPDATE shopping_list
    │    SET status = 'purchased', purchased_at = now()
    │    WHERE id = itemId
    │
    ├── INSERT INTO purchase_history
    │    (household_id, product_id, quantity, purchased_at)
    │
    └── UPSERT household_inventory_rules:
         ├── EXISTS? → UPDATE SET last_purchased_at = now()
         └── NOT EXISTS? → INSERT new rule
              (household_id, product_id, last_purchased_at = now())
```

**DB Operations:**

- **Write**: `shopping_list` (update status), `purchase_history` (new row), `household_inventory_rules` (update or insert)
- **Read**: `household_inventory_rules` (check if rule exists)

**Key design decisions:**

- No `fetchRecommendations` call after purchase — optimistic updates are trusted, DB catches up in background
- `last_purchased_at` is updated on EVERY purchase, not just first purchase
- If DB write fails, purchase is queued in `offlineQueue` for retry

---

## 6. Flow 4: Reactivating an Item (All Items → Cart)

```
User taps cart icon on item in "All Items" section
    │
    ▼
reactivateItem(itemId) — synchronous optimistic updates:
    │
    ├── 1. item.status → 'active', purchased_at → null
    │      (item moves from "All Items" to "Cart" section in UI)
    │
    └── 2. Refresh recommendations:
           ├── Rebuild purchasedProductIds (this product removed)
           ├── Filter _allRecCandidates to only purchased items
           └── Update recommendations (top 5)
    │
    ▼
Async DB operation:
    └── UPDATE shopping_list
         SET status = 'active', purchased_at = null
         WHERE id = itemId
```

**DB Operations:**

- **Write**: `shopping_list` (update status to 'active')

**Why recommendations refresh:** The item just moved from "purchased" to "active". Since recommendations only show "purchased" items, it must be removed.

---

## 7. Flow 5: Snooze / Delete Item

### Snooze

```
User selects snooze duration (e.g., 7 days)
    │
    ├── Optimistic: remove item from visible list
    │
    └── UPDATE shopping_list
         SET status = 'snoozed', snooze_until = now() + interval
         WHERE id = itemId
    │
    ▼
DB Trigger: trg_confidence_penalty_on_snooze
    └── confidence_score -= 15
         └── auto_add_status recalculated
```

### Delete

```
User swipes to delete
    │
    ├── Optimistic: remove from items[] array
    │
    └── DELETE FROM shopping_list WHERE id = itemId
    │
    ▼
DB Trigger: trg_confidence_penalty_on_delete
    └── confidence_score -= 20
         └── May demote from auto_add → suggest_only/manual_only
```

**DB Operations:**

- **Write**: `shopping_list` (update/delete)
- **Trigger writes**: `household_inventory_rules` (confidence penalty)

---

## 8. Flow 6: Nightly Prediction Engine

Runs as a Supabase Edge Function at 02:00 daily via pg_cron.
Uses **service role key** to bypass RLS (iterates over ALL households).

```
pg_cron triggers Edge Function
    │
    ├── STEP 1: recalculateEMA()
    │    │
    │    ├── SELECT * FROM household_inventory_rules
    │    │    WHERE last_purchased_at IS NOT NULL
    │    │
    │    └── For each rule:
    │         ├── SELECT FROM purchase_history
    │         │    WHERE purchased_at > rule.last_purchased_at
    │         │    ORDER BY purchased_at ASC
    │         │
    │         ├── For each new purchase:
    │         │    ├── rawInterval = daysBetween(prevDate, purchaseDate)
    │         │    ├── perItemInterval = rawInterval / prevQuantity
    │         │    ├── EMA = 0.3 × perItemInterval + 0.7 × EMA_old
    │         │    └── If variance ≤ 15% → confidence += 10
    │         │
    │         └── UPDATE household_inventory_rules SET
    │              ema_days, confidence_score, last_purchased_at,
    │              auto_add_status = derive(confidence)
    │
    └── STEP 2: evaluateRulesAndAct()
         │
         ├── SELECT * FROM household_inventory_rules
         │    WHERE ema_days > 0 AND last_purchased_at IS NOT NULL
         │
         └── For each rule:
              ├── nextDate = last_purchased_at + (ema_days × lastQty)
              ├── IF nextDate > now() → skip (not due yet)
              │
              ├── IF confidence ≥ 85 (auto_add):
              │    ├── Check: not already active in shopping_list
              │    ├── Check: not snoozed with active snooze window
              │    └── INSERT INTO shopping_list (status='active')
              │
              └── IF confidence 50-84 (suggest_only):
                   └── UPDATE auto_add_status = 'suggest_only'
```

**DB Operations:**

- **Read**: `household_inventory_rules`, `purchase_history`, `shopping_list` (existence checks)
- **Write**: `household_inventory_rules` (EMA + confidence), `shopping_list` (auto-add inserts)

---

## 9. Flow 7: Recommendation Line (Client-Side)

Triggered by `fetchRecommendations(householdId)` — called on app load and pull-to-refresh.

```
fetchRecommendations(householdId)
    │
    ├── SELECT * FROM household_inventory_rules
    │    JOIN products ON product_id
    │    WHERE household_id = X AND ema_days > 0
    │    AND last_purchased_at IS NOT NULL
    │
    ├── For each rule:
    │    ├── lastDate = MAX(rule.last_purchased_at, item.purchased_at)
    │    │    (uses more recent of DB rule date and shopping list date)
    │    ├── nextDate = lastDate + ema_days × lastQty × DAY_MS
    │    ├── daysLeft = ceil((nextDate - now) / DAY_MS)
    │    │
    │    ├── Compute predictionStatusMap[product_id]:
    │    │    ├── daysLeft ≤ 0 → "overdue" (red dot)
    │    │    ├── daysLeft ≤ 2 → "due-soon" (yellow dot)
    │    │    ├── daysLeft ≤ 5 → "upcoming" (green dot)
    │    │    └── else → "normal" (no dot)
    │    │
    │    └── Recommendation candidate if:
    │         ├── daysLeft ≤ 3
    │         └── product is in purchased items (status='purchased')
    │              (NOT in active cart)
    │
    ├── Filter out _skippedRecIds (session skips)
    ├── Sort by daysLeft (most urgent first)
    └── Store: _allRecCandidates = full sorted pool
               recommendations = top 5 visible
               predictionStatusMap = all products
```

### User interactions with recommendation cards:

**"🛒 הוסף" (Add to Cart):**

```
acceptRecommendation(rec)
    │
    ├── addItem(productId, householdId, 1, product, true)
    │    └── INSERT INTO shopping_list (status='active')
    │
    ├── Rebuild purchasedProductIds (exclude cart items)
    ├── Filter _allRecCandidates (remove this product + cart items)
    └── Update recommendations = remaining.slice(0, 5)
```

**"דלג" (Skip):**

```
skipRecommendation(rec)
    │
    ├── Add rec.productId to _skippedRecIds (session Set)
    ├── Rebuild purchasedProductIds
    ├── Filter _allRecCandidates (exclude skipped + cart)
    └── Update recommendations = remaining.slice(0, 5)
```

**DB Operations:**

- **Read**: `household_inventory_rules` (with products join)
- **Write** (on "הוסף"): `shopping_list` (new active item)

---

## 10. Flow 8: Suggestion Chips (Archived)

> **Archived**: The `SuggestionChips` component has been replaced by `RecommendationLine` (Step 5t/5u, 2026-03-17). The `fetchSuggestions()` method still exists in the store but is never called. Recommendation logic is now handled entirely by `fetchRecommendations()` which computes depletion percentages and shows items due within 3 days.
>
> See **Flow 7: Recommendation Line** for the current implementation.

---

## 11. Flow 9: Depletion Tracking & Status Labels

> **Note**: Prediction status dots have been replaced by depletion percentage labels (Step 5u, 2026-03-17).

Depletion % and Hebrew status labels are shown next to items in the "הקטלוג שלי" section.

### Depletion Label Tiers

| Depletion % | Label       | Color                            |
| ----------- | ----------- | -------------------------------- |
| ≥ 100%      | לך תקנה     | 🔴 Red (rgba(239,68,68,0.7))     |
| ≥ 80%       | תכף נגמר    | 🟠 Orange (rgba(249,115,22,0.7)) |
| ≥ 60%       | חצי קלאץ'   | 🟡 Yellow (rgba(251,191,36,0.7)) |
| ≥ 30%       | יש, אל תדאג | Gray (textSecondary)             |
| ≥ 1%        | יש בשפע     | Gray (textSecondary)             |
| 0%          | הרגע קנינו  | Gray (textMuted)                 |

**Data source:** `depletionPercentMap` (Map<productId, number>) populated by `fetchRecommendations`.

**Calculation:**

```
totalCycleDays = ema_days × lastQty
daysElapsed = (now - lastDate) / DAY_MS
depletionPct = min(100, max(0, round((daysElapsed / totalCycleDays) × 100)))
```

**Display control:** Toggle via `showDepletion` in `appSettingsStore`.

### UI Features

- Depletion column rendered in catalog cards when `showDepletion` is true
- Sort by depletion ("עומד להיגמר") — highest depletion first, items without data sink to bottom
- Sort direction toggle (↑/↓) on all sort chips
- Sticky section headers pin while scrolling via `stickyHeaderIndices`
- Collapsible sections (▲/▼) for both cart and catalog

---

## 12. Flow 10: Realtime Sync

The `shopping_list` and `household_inventory_rules` tables are published to Supabase Realtime.

```
subscribeRealtime(householdId)
    │
    ├── Listen: shopping_list changes
    │    │
    │    ├── INSERT → Add item to local items[] (dedup check)
    │    ├── UPDATE (status='purchased') → Update local item
    │    ├── UPDATE (status='snoozed') → Remove from local view
    │    ├── UPDATE (status='active') → Re-fetch with product join
    │    └── DELETE → Remove from local items[]
    │
    └── No automatic recommendations/dots refresh on realtime events
         (optimistic updates handle current-device changes;
          cross-device changes reflected on next pull-to-refresh)
```

**DB Operations:**

- **Read**: Realtime subscription (WebSocket, no polling)
- **Write**: None (realtime is read-only listener)

---

## 13. EMA Algorithm Reference

### Formula

$$EMA_{new} = \alpha \cdot \text{perItemInterval} + (1 - \alpha) \cdot EMA_{old}$$

Where:

- $\alpha = 0.3$
- $\text{perItemInterval} = \frac{\text{rawDaysBetweenPurchases}}{Q_{previous}}$
- $EMA_{old}$ = current `ema_days` in `household_inventory_rules`

### Per-Item Normalisation

`ema_days` is ALWAYS per 1 item. Example:

| Purchase | Date   | Qty | Raw Interval | Per-Item Interval |
| -------- | ------ | --- | ------------ | ----------------- |
| #1       | Mar 1  | 2   | —            | —                 |
| #2       | Mar 15 | 3   | 14 days      | 14 ÷ 2 = **7**    |
| #3       | Apr 5  | 1   | 21 days      | 21 ÷ 3 = **7**    |

After #2: EMA = 7 (seed).
After #3: EMA = 0.3 × 7 + 0.7 × 7 = **7**.

### Next Purchase Date

$$\text{NextDate} = \text{lastPurchasedAt} + (ema\_days \times Q_{last})$$

- Buy 1 → next in 7 days
- Buy 3 → next in 21 days

---

## 14. Confidence Score State Machine

```
┌──────────────┐
│  manual_only │  Score < 50
│  (learning)  │  No automatic action
└──────┬───────┘
       │ Regular purchases → +10/event
       ▼
┌──────────────┐
│ suggest_only │  Score 50–84
│ (suggesting) │  Shown as suggestion chip
└──────┬───────┘
       │ User accepts suggestions → +15/event
       ▼
┌──────────────┐
│   auto_add   │  Score ≥ 85
│ (autonomous) │  Auto-added to shopping list
└──────────────┘
       │
       │ Snooze (-15) / Delete (-20)
       ▼
    Score drops → demoted back
```

### Score Adjustments

| Signal                                    | Change | Where                   |
| ----------------------------------------- | ------ | ----------------------- |
| Purchase within 15% of predicted interval | +10    | Nightly function        |
| User accepts suggestion                   | +15    | acceptSuggestion action |
| User deletes auto-added item              | -20    | DB trigger              |
| User snoozes item                         | -15    | DB trigger              |

---

## 15. Known Edge Cases & Decisions

### Cold Start (New User)

- No `purchase_history` → no EMA → `ema_days = 0` → no dots, no recommendations
- First purchase creates a `household_inventory_rules` row with `ema_days = 0`
- Second purchase (through nightly) computes first real EMA
- **Backfill migration** seeds synthetic purchases 7 days before first real purchase to bootstrap predictions

### Quantity = 0 Safety

- Quantity defaults to 1 if not set or 0
- Division by zero prevented by `?? 1` fallback in all quantity lookups

### Session vs Persistent Skips

- `_skippedRecIds` is a session-only Set — resets on app restart
- Skipping does NOT penalize confidence (unlike snooze/delete)

### Optimistic vs DB Truth

- Dots and recommendations are set optimistically on purchase, then the DB is updated async
- No `fetchRecommendations` call after purchase to prevent overwriting optimistic state
- Next app load re-fetches everything from DB (which now has updated `last_purchased_at`)

### Items in Both Cart and All Items

- The same `product_id` can exist in `shopping_list` with `status='active'` (cart) and there might be a separate row with `status='purchased'` (all items)
- Recommendations ONLY source from `status='purchased'` items
- Dots show for ALL products (both sections) based on `predictionStatusMap`

### Backfill SQL Migration

- File: `supabase/migrations/20260316_backfill_inventory_rules.sql`
- Creates `purchase_history` from `shopping_list` (all statuses)
- Seeds synthetic "earlier" purchase 7 days before first real one
- Creates `household_inventory_rules` with `ema_days = 7` default
- Uses `ON CONFLICT ... DO UPDATE` so re-running is safe
- Outputs BEFORE/AFTER counts via `RAISE NOTICE`
