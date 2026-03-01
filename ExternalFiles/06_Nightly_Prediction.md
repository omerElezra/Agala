# Nightly Prediction Engine — Technical Reference

## 1. Overview

The prediction engine runs as a **Supabase Edge Function** triggered every night
at **02:00** by `pg_cron`. Its job is to:

1. **Recalculate** the Exponential Moving Average (EMA) for products that were
   purchased since the last run.
2. **Evaluate** which products are "due" and either auto-add them to the
   shopping list or flag them as suggestions.

> **Key invariant**: `ema_days` is **always per 1 item**.
> When the user buys a quantity $Q$, the actual expected interval until the
> next purchase is $ema\_days \times Q$.

---

## 2. Algorithm: Per-Item EMA

### 2.1 Raw vs Normalised Intervals

Each pair of consecutive purchases produces a **raw interval** in days.
Because a user may buy different quantities each time, we **normalise** each
interval by the quantity purchased at the **start** of that interval:

$$
\text{perItemInterval}_i = \frac{\text{rawDays}_i}{Q_{i-1}}
$$

Where $Q_{i-1}$ is the quantity from the earlier purchase in the pair.

### 2.2 EMA Formula

$$
EMA_{new} = \alpha \cdot \text{perItemInterval} + (1 - \alpha) \cdot EMA_{old}
$$

| Symbol      | Value             | Description                                                        |
| ----------- | ----------------- | ------------------------------------------------------------------ |
| $\alpha$    | `0.3`             | Smoothing factor — 30 % weight to latest interval, 70 % to history |
| $EMA_{old}$ | stored `ema_days` | Previous per-item EMA from `household_inventory_rules`             |

### 2.3 Example

| #   | Date   | Qty | Raw Interval | Per-Item Interval |
| --- | ------ | --- | ------------ | ----------------- |
| 1   | Jan 1  | 2   | —            | —                 |
| 2   | Jan 15 | 3   | 14 days      | 14 / 2 = **7**    |
| 3   | Feb 5  | 1   | 21 days      | 21 / 3 = **7**    |

After purchase #2: $EMA = 7$ (seed value).
After purchase #3: $EMA = 0.3 \times 7 + 0.7 \times 7 = 7$.

`ema_days = 7` → if the user now buys 1 item, next purchase predicted in 7 days.
If they buy 3, predicted in $7 \times 3 = 21$ days.

---

## 3. Next Purchase Prediction

$$
\text{NextDate} = \text{last\_purchased\_at} + (ema\_days \times Q_{last})
$$

Where $Q_{last}$ is the quantity from the most recent purchase.

Both the **server-side nightly function** and the **client-side UI** use
this formula.

---

## 4. Confidence Score & State Machine

The `confidence_score` (0–100) in `household_inventory_rules` drives the
auto-add behaviour.

| Range | Status         | Behaviour                                                        |
| ----- | -------------- | ---------------------------------------------------------------- |
| ≥ 85  | `auto_add`     | Item auto-inserted into `shopping_list` with `status = 'active'` |
| 50–84 | `suggest_only` | Shown in UI suggestions section                                  |
| < 50  | `manual_only`  | Algorithm still learning — no action                             |

### Score Adjustments

| Signal                                              | Change  |
| --------------------------------------------------- | ------- |
| Purchase within 15 % of predicted per-item interval | **+10** |
| User accepts a suggestion                           | **+15** |
| User deletes an auto-added item                     | **−20** |
| User snoozes an item                                | **−15** |

---

## 5. Execution Flow (Nightly Cron)

```
pg_cron (02:00)
  │
  ├─ STEP 1 — recalculateEMA()
  │    For every rule with last_purchased_at:
  │    ├─ Fetch new purchases since last_purchased_at
  │    ├─ Fetch previous purchase quantity (for interval normalisation)
  │    ├─ Walk purchases chronologically:
  │    │    perItemInterval = rawDays / previousQuantity
  │    │    EMA_new = α × perItemInterval + (1−α) × EMA_old
  │    │    Update previousQuantity for next iteration
  │    └─ Persist updated ema_days, confidence_score, last_purchased_at
  │
  └─ STEP 2 — evaluateRulesAndAct()
       For every rule with ema_days > 0:
       ├─ Fetch last purchase quantity (Q_last)
       ├─ nextDate = last_purchased_at + ema_days × Q_last
       ├─ Skip if nextDate > NOW()
       ├─ confidence ≥ 85 → auto-add (if not already active/snoozed)
       ├─ confidence 50–84 → mark suggest_only
       └─ confidence < 50 → no action (still learning)
```

---

## 6. Client-Side Prediction (Item Detail Screen)

The item detail screen (`app/item/[id].tsx`) mirrors the server logic for
instant feedback without waiting for the nightly run.

### What it computes

| Value                | Formula                                                     | Note                     |
| -------------------- | ----------------------------------------------------------- | ------------------------ |
| `historyEmaDays`     | Per-item EMA from purchase history                          | Same α=0.3 normalisation |
| `effectiveCycleDays` | `rule.ema_days` (or fallback to `historyEmaDays`)           | Always per 1 item        |
| `nextBuyDate`        | `lastPurchase + effectiveCycleDays × lastPurchaseQuantity`  | Actual predicted date    |
| `progressRatio`      | `elapsedDays / (effectiveCycleDays × lastPurchaseQuantity)` | 0–1 depletion meter      |
| `depletionPercent`   | `progressRatio × 100`                                       | Shown as "עומד להיגמר"   |

### UI Display

- **Big number** shows `כל X ימים` — this is the per-item cycle.
- **Subtitle** shows `ליחידה` along with purchase count and quantity info.
- When quantity > 1, subtitle also shows:
  `ליחידה · קנייה אחרונה ×Q → Y ימים` (the actual adjusted interval).

### Manual Mode

When the user sets a manual cycle:

- The value entered is **per 1 item**.
- The system multiplies by quantity for the actual next-purchase date.
- Code comment: `// per 1 item; multiply by qty for actual interval`.

---

## 7. Data Flow

```
User checks off item (checkOffItem in shoppingListStore)
  │
  ├─ Records purchase in purchase_history { product_id, quantity, purchased_at }
  ├─ Updates shopping_list row status → 'purchased'
  │
  ▼
Nightly Cron (02:00)
  │
  ├─ recalculateEMA: reads new purchases, normalises intervals by qty,
  │                   updates ema_days (per 1 item)
  │
  └─ evaluateRulesAndAct: checks if next predicted date has passed,
                           auto-adds or suggests based on confidence
```

---

## 8. Tables Involved

| Table                       | Role                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `household_inventory_rules` | Stores `ema_days` (per 1 item), `confidence_score`, `auto_add_status`, `last_purchased_at` |
| `purchase_history`          | Append-only log of purchases with `quantity`                                               |
| `shopping_list`             | Active items; nightly function inserts auto-added items here                               |
| `products`                  | Product catalog (name, category)                                                           |

---

## 9. Edge Cases

| Scenario                       | Handling                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| First purchase (no intervals)  | Uses category-based smart default for `ema_days`                |
| Only 1 purchase                | Basic stats only; EMA not computed; score stays low             |
| Quantity = 0 or null           | Treated as 1 (fallback)                                         |
| Same-day duplicate purchases   | Skipped (interval ≤ 0)                                          |
| Snoozed items                  | Respected — nightly function skips until `snooze_until` expires |
| Product already on active list | Nightly function skips auto-add                                 |
| Manual mode (`manual_only`)    | EMA is not auto-updated; user controls the cycle                |

---

## 10. Environment Variables

| Variable                    | Required | Description                                    |
| --------------------------- | -------- | ---------------------------------------------- |
| `SUPABASE_URL`              | Yes      | Supabase project URL                           |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes      | Service role key (bypasses RLS)                |
| `CRON_SECRET`               | Yes      | Shared secret for pg_cron → edge function auth |

The function rejects all requests without a valid `Authorization: Bearer <CRON_SECRET>` header.
