# Prediction Logic & AI Engine: Smart Grocery List App

## 1. Overview

This document strictly defines the mathematical and logical rules for the AI prediction engine. The engine runs as a Serverless Edge Function triggered nightly, calculating when products should be re-added to a household's shopping list.

## 2. Core Algorithm: Exponential Moving Average (EMA)

Do not use basic averages. The system MUST calculate the interval between purchases using EMA to give higher weight to recent consumption trends.

> **Key invariant**: `ema_days` is **always per 1 item**.
> Each raw interval is divided by the quantity purchased at the start of that interval.

- **Per-item interval:**
  $$\text{perItemInterval}_i = \frac{\text{rawDays}_i}{Q_{i-1}}$$
  Where $Q_{i-1}$ is the quantity from the earlier purchase in the pair.

- **EMA formula:**
  $$EMA_{new}=\alpha\cdot \text{perItemInterval}+(1-\alpha)\cdot EMA_{old}$$
- **Variables:**
  - $\text{perItemInterval}$: Days between consecutive purchases **divided by the quantity** purchased at the start of the interval.
  - $\alpha$: Smoothing factor. Set initially to $0.3$ (gives 30% weight to the latest interval, 70% to historical data).
  - $EMA_{old}$: The previously stored `ema_days` in the `household_inventory_rules` table (always per 1 item).

## 3. Confidence Score & State Machine

The `confidence_score` (0-100) dictates how the app interacts with the user to prevent UI friction.

- **Thresholds:**
  - **Score >= 85:** `Auto-Add` -> The item is automatically inserted into the active `shopping_list` table.
  - **Score 50-84:** `Suggest` -> The item appears in the "Discovery/Suggestions" UI.
  - **Score < 50:** `Manual` -> The algorithm is still learning; no action taken.
- **Positive Signals (Score Increases):**
  - Ticking 'V' (Purchasing) an item within a 15% variance of the predicted EMA interval adds +10 to the score.
  - User manually accepting a "Suggested" item adds +15.
- **Negative Signals (Penalties / Score Decreases):**
  - Swiping/Deleting an Auto-Added item subtracts -20.
  - Using the "Snooze" feature subtracts -15 and recalibrates the next prediction date.

## 4. Execution Flow (The Nightly Cron)

A `pg_cron` job triggers a Supabase Edge Function every night at 02:00 local time. The function executes the following:

1. Fetch all rows from `household_inventory_rules` where `last_purchased_at + (ema_days * quantity_modifier) <= NOW()`.
2. Check the `confidence_score` for each matched row.
3. If >= 85, insert the `product_id` into `shopping_list` with status `active` and flag `auto_added = true`.
4. If 50-84, flag the item for the "Suggestions" view on the client's home screen.

## 5. Edge Cases Logic

- **Quantity Modifier (per-item normalisation):** `ema_days` is always stored **per 1 item**. When a user purchases quantity $Q$, the expected days until the next purchase is: $NextDate = last\_purchased\_at + (ema\_days \times Q)$. The EMA itself is calculated from per-item intervals (raw days ÷ quantity), so buying 3 items every 21 days → per-item EMA = 7, next buy in $7 \times 3 = 21$ days.
- **Manual mode:** When the user sets a manual cycle, the value is **per 1 item**. The system multiplies by the last purchase quantity for the actual next-purchase date.
- **Snooze Logic:** If a user hits "Snooze" on an Auto-Added item, the item's status in the active list changes to `snoozed`, and the `snooze_until` timestamp is set according to user input (e.g., +7 days). The engine will ignore this item until the snooze period expires.

## 6. Related Documentation

- **Detailed nightly prediction reference**: See `06_Nightly_Prediction.md` for full execution flow, data flow diagrams, and worked examples.
