# Agala Database — Explained

This document explains the **why** behind the database design — how data flows through the system, why each table exists, and how they work together to power the AI grocery prediction engine.

---

## The Big Picture

Agala is a smart grocery list app that **learns** your household's shopping patterns. The database is designed around three core ideas:

1. **Household-centric** — everything belongs to a household, not a single user. Two partners share the same list in real-time.
2. **Purchase history drives predictions** — every checkout feeds an AI engine that calculates when you'll need each product again.
3. **Confidence grows over time** — the system starts cautious ("manual only") and gradually earns the right to auto-add items to your list.

```
User signs up
    │
    ▼
Household created (auto)
    │
    ├── Products added to Shopping List
    │       │
    │       ▼
    │   User checks off items ("V")
    │       │
    │       ├── purchase_history ← immutable log
    │       │
    │       └── household_inventory_rules ← EMA + confidence updated
    │               │
    │               ▼
    │       Nightly Prediction Engine (02:00)
    │               │
    │               ├── confidence ≥ 85 → Auto-add to list
    │               ├── confidence 50-84 → Show as suggestion
    │               └── confidence < 50 → Keep learning
    │
    └── Real-time sync to all household devices
```

---

## Why Each Table Exists

### `households` — The Multi-Tenant Boundary

Every piece of data in Agala is scoped to a household. This table is the anchor that all other tables reference.

**Why not scope to users?** Because a grocery list is shared. When Ravit checks off "Milk" at the supermarket, the list updates instantly on Omer's phone too. The household is the single source of truth.

**Created automatically** — when a user signs up, the `handle_new_user` trigger creates a household and links the user to it. No manual setup needed.

---

### `users` — Identity & Household Membership

Maps Supabase Auth identities to households. Each user belongs to exactly one household.

**Key design choice:** The `id` column directly references `auth.users(id)`. This means Supabase Auth is the single source of truth for authentication — the `users` table only stores profile info (display name) and the household link.

**Future-proof for multi-user households:** The schema supports multiple users per household (e.g., partners, family members). The RLS policies ensure they can see each other's data within the same household but nothing outside it.

---

### `products` — The Shared Catalog

Products have two flavors:

| Type                      | `is_custom` | `created_by_household` | Visibility          |
| ------------------------- | ----------- | ---------------------- | ------------------- |
| **Global** (seed data)    | `false`     | `NULL`                 | Everyone can see    |
| **Custom** (user-created) | `true`      | household UUID         | Only that household |

**Why "medium resolution"?** The product catalog uses generic names like "חלב 3%" (Milk 3%) rather than brand-specific "תנובה חלב 3% 1 ליטר". This prevents catalog fragmentation — the AI needs enough purchases of the same product to learn patterns.

**Category system:** Each product has an optional category from the 16 official Hebrew categories. These categories drive the grouped display on the main shopping list screen. The `categoryDetector.ts` utility auto-detects categories for new products based on keyword matching.

---

### `shopping_list` — The Heart of the App

This is the active shopping list. Each row represents one item that a household needs to buy (or has already bought).

**The lifecycle of a shopping list item:**

```
         ┌─────────┐
         │  active  │ ← Item appears on the list
         └────┬─────┘
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
┌─────────┐ ┌────────┐ ┌─────────┐
│purchased│ │snoozed │ │ deleted │
│(status) │ │(status)│ │ (row    │
│         │ │        │ │ removed)│
└─────────┘ └────────┘ └─────────┘
```

- **`active`** — on the visible list, waiting to be bought
- **`purchased`** — user tapped the "V" checkmark; `purchased_at` is set
- **`snoozed`** — user said "not now"; `snooze_until` is set; disappears until that date
- **deleted** — user swiped to remove; row is physically deleted from the table

**Why keep purchased items?** Historical purchased rows serve as the initial backfill source for `purchase_history`. The `purchased_at` timestamp is the critical data point that feeds the prediction algorithm.

**Real-time sync:** This table is published to Supabase Realtime. Any change (insert, update, delete) is instantly pushed to all household members' devices via WebSocket.

---

### `purchase_history` — The Immutable Ledger

Every time a user checks off an item, a row is written here. Unlike `shopping_list` (which represents the current state), `purchase_history` is an append-only log.

**Why a separate table?** The `shopping_list` table is mutable — items get deleted, snoozed, and re-added. The prediction engine needs a clean, chronological record of **when** and **how many** of each product were purchased. Separating this into its own table means we never lose purchase data regardless of what happens to the shopping list.

**What the AI uses from this table:**

- Chronological pairs of purchases → calculate raw intervals (days between buys)
- Quantity at each purchase → normalize intervals to per-item rates
- These feed into the EMA formula: $EMA_{new} = 0.3 \times \text{perItemInterval} + 0.7 \times EMA_{old}$

---

### `household_inventory_rules` — The AI Brain

This is where the prediction engine stores its learned state for each product in each household. One row per product per household.

**The three key fields:**

| Field               | What it stores                                 | Example                             |
| ------------------- | ---------------------------------------------- | ----------------------------------- |
| `ema_days`          | Average days between purchases, **per 1 item** | `7.0` means "one unit lasts 7 days" |
| `confidence_score`  | How sure the AI is (0–100)                     | `92` = high confidence, auto-add    |
| `last_purchased_at` | Baseline for the next prediction               | `2026-03-01T10:00:00Z`              |

**The prediction formula:**

$$\text{NextPurchaseDate} = \text{last\_purchased\_at} + (ema\_days \times Q_{last})$$

Where $Q_{last}$ is the quantity from the most recent purchase. If `ema_days = 7` and you bought 3 units, the next purchase is predicted in 21 days.

**The confidence state machine:**

```
                    ┌──────────────┐
                    │  manual_only │  Score < 50
                    │  (learning)  │  No automatic action
                    └──────┬───────┘
                           │ User keeps buying regularly
                           │ Score climbs with +10/+15 signals
                           ▼
                    ┌──────────────┐
                    │ suggest_only │  Score 50–84
                    │ (suggesting) │  Shown as suggestion chip
                    └──────┬───────┘
                           │ User accepts suggestions
                           │ Score reaches 85+
                           ▼
                    ┌──────────────┐
                    │   auto_add   │  Score ≥ 85
                    │ (autonomous) │  Auto-added to shopping list
                    └──────────────┘
                           │
              Snooze (-15) │ Delete (-20)
                           │
                           ▼
                    Score drops → demoted back
```

**Real-time sync:** Also published to Supabase Realtime so the client can react to score changes instantly (e.g., a suggestion chip appearing).

---

## How Data Flows Through the System

### Flow 1: Adding a Product

```
User types "חלב" → App searches products table
    │
    ├── Found? → Reuse existing product row
    │              (normalize category if legacy)
    │
    └── Not found? → Create new product row
                      (auto-detect category from keywords)
                      │
                      ▼
                 INSERT into shopping_list
                 (status = 'active', household_id = user's household)
                      │
                      ▼
                 Realtime push → other household members see it
```

### Flow 2: Checking Off an Item ("V")

```
User taps checkmark → Optimistic UI update (Zustand)
    │
    ├── Instant state changes (before any DB call):
    │    ├── item.status → 'purchased', purchased_at → now
    │    ├── predictionStatusMap[product_id] → 'normal' (dot removed)
    │    └── Remove from _allRecCandidates + recommendations
    │
    └── Async DB operations:
         ├── UPDATE shopping_list SET status='purchased', purchased_at=now()
         ├── INSERT into purchase_history (immutable log)
         ├── UPDATE household_inventory_rules SET last_purchased_at=now()
         │   (or INSERT new rule if first purchase)
         └── Realtime push → item moves to "All Items" on all devices
```

### Flow 3: Nightly Prediction (02:00 daily)

```
Edge Function triggers
    │
    ├── STEP 1: Recalculate EMA
    │    For each household_inventory_rule:
    │    └── Fetch new purchases from purchase_history
    │        └── Recalculate ema_days using EMA formula
    │            └── Update confidence_score (+10 if on-time)
    │
    └── STEP 2: Evaluate & Act
         For each rule where next date ≤ now():
         ├── Score ≥ 85 → INSERT into shopping_list (auto_add)
         ├── Score 50-84 → Flag as suggest_only
         └── Score < 50 → Skip (still learning)
```

### Flow 4: Snooze/Delete Feedback Loop

```
User snoozes auto-added item
    │
    └── Trigger: trg_confidence_penalty_on_snooze
         └── confidence_score -= 15
              └── auto_add_status recalculated
                   └── May demote from auto_add → suggest_only

User deletes active auto-added item
    │
    └── Trigger: trg_confidence_penalty_on_delete
         └── confidence_score -= 20
              └── May demote from auto_add → manual_only
```

---

## Security Model

### Row Level Security (RLS)

Every table has RLS enabled. The fundamental rule is: **you can only see and modify data belonging to your household.**

The `get_my_household_id()` function translates `auth.uid()` → `household_id`. Every RLS policy uses this function to enforce the boundary.

**Exception:** The `products` table allows reading global products (`is_custom = false`) regardless of household, so everyone can search the shared catalog.

### Trigger Functions: `SECURITY DEFINER`

All trigger functions run as `SECURITY DEFINER`, meaning they bypass RLS. This is necessary because:

- `handle_new_user` needs to insert into `households` and `users` during signup (before RLS can resolve the user's household)
- Confidence penalty triggers need to update `household_inventory_rules` in response to `shopping_list` changes (cross-table operations that RLS would block)

### Edge Function: Service Role Key

The nightly prediction function uses the Supabase `service_role` key to bypass RLS entirely. This is correct because it's a backend-only process that needs to iterate over all households.

---

## The EMA Algorithm — Simplified

The Exponential Moving Average (EMA) is the core of the prediction logic. Here's why it matters:

**Problem:** A simple average treats all purchase intervals equally. If you bought milk every 7 days for months but suddenly started buying every 4 days (new baby?), a simple average would take weeks to adapt.

**Solution:** EMA with α=0.3 gives 30% weight to the latest interval and 70% to history. It adapts faster to recent changes while staying stable against one-off anomalies (like buying extra before a holiday).

**The per-item normalization:** `ema_days` always represents how long **one unit** lasts. If you buy 3 milk cartons every 21 days, `ema_days = 7` (one carton per 7 days). This means:

- Buy 1 → next purchase in 7 days
- Buy 2 → next purchase in 14 days
- Buy 6 → next purchase in 42 days

The formula dynamically adjusts the prediction based on how much you bought.

---

## Category System

Products are organized into 16 official Hebrew categories. The category system serves two purposes:

1. **Grouped display** — the shopping list groups items by category (e.g., all dairy together) for efficient in-store shopping
2. **Smart defaults** — each category has a default EMA cycle (e.g., dairy = 7 days, cleaning = 30 days) used as the initial guess before the AI has enough data

**Auto-detection:** When a product is added, `categoryDetector.ts` uses keyword matching (scored — longest match wins) to assign a category. For example, "חלב" matches "חלב וביצים" (Dairy & Eggs).

**Legacy normalization:** Historical data may contain old category names (e.g., "ירקות" instead of "פירות וירקות"). The `normalizeCategory()` function maps 50+ legacy category names to the official 16, applied both in the UI and when reusing existing products from the database.
