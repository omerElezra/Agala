-- ============================================================
-- Backfill + Diagnose: household_inventory_rules & purchase_history
-- Run in Supabase SQL Editor (bypasses RLS).
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- DIAGNOSTIC: Show current table state BEFORE changes
-- ══════════════════════════════════════════════════════════════
DO $$
DECLARE
  sl_total   int;
  sl_active  int;
  sl_purch   int;
  ph_count   int;
  hir_count  int;
  prod_count int;
BEGIN
  SELECT count(*) INTO sl_total  FROM shopping_list;
  SELECT count(*) INTO sl_active FROM shopping_list WHERE status = 'active';
  SELECT count(*) INTO sl_purch  FROM shopping_list WHERE status = 'purchased';
  SELECT count(*) INTO ph_count  FROM purchase_history;
  SELECT count(*) INTO hir_count FROM household_inventory_rules;
  SELECT count(*) INTO prod_count FROM products;
  RAISE NOTICE '══════ BEFORE BACKFILL ══════';
  RAISE NOTICE 'shopping_list  total=%, active=%, purchased=%', sl_total, sl_active, sl_purch;
  RAISE NOTICE 'purchase_history      count=%', ph_count;
  RAISE NOTICE 'inventory_rules       count=%', hir_count;
  RAISE NOTICE 'products              count=%', prod_count;
END $$;

-- ── Step 1: Backfill purchase_history from shopping_list ─────
-- ALL shopping_list items get a purchase_history record.
-- For 'active' items we use added_at as a proxy purchase date.
INSERT INTO purchase_history (household_id, product_id, quantity, purchased_at)
SELECT
  sl.household_id,
  sl.product_id,
  sl.quantity,
  COALESCE(sl.purchased_at, sl.added_at, now())
FROM shopping_list sl
WHERE NOT EXISTS (
  SELECT 1 FROM purchase_history ph
  WHERE ph.household_id = sl.household_id
    AND ph.product_id   = sl.product_id
    AND ph.purchased_at  = COALESCE(sl.purchased_at, sl.added_at, now())
);

-- ── Step 2: Seed a synthetic "earlier" purchase ──────────────
-- For each product with only 1 purchase_history row, add one
-- 7 days earlier so the nightly engine can compute an EMA interval.
INSERT INTO purchase_history (household_id, product_id, quantity, purchased_at)
SELECT
  ph.household_id,
  ph.product_id,
  1,
  MIN(ph.purchased_at) - interval '7 days'
FROM purchase_history ph
GROUP BY ph.household_id, ph.product_id
HAVING COUNT(*) = 1;

-- ── Step 3: Create inventory rules ───────────────────────────
-- Seed with earliest purchase as last_purchased_at.
INSERT INTO household_inventory_rules (
  household_id, product_id, ema_days, confidence_score,
  last_purchased_at, auto_add_status
)
SELECT
  ph.household_id,
  ph.product_id,
  7,          -- default 7-day cycle (nightly will recalculate)
  0,
  MIN(ph.purchased_at),
  'manual_only'
FROM purchase_history ph
GROUP BY ph.household_id, ph.product_id
ON CONFLICT (household_id, product_id) DO UPDATE SET
  ema_days          = EXCLUDED.ema_days,
  last_purchased_at = EXCLUDED.last_purchased_at;

-- ══════════════════════════════════════════════════════════════
-- DIAGNOSTIC: Show state AFTER changes
-- ══════════════════════════════════════════════════════════════
DO $$
DECLARE
  ph_count  int;
  hir_count int;
BEGIN
  SELECT count(*) INTO ph_count  FROM purchase_history;
  SELECT count(*) INTO hir_count FROM household_inventory_rules;
  RAISE NOTICE '══════ AFTER BACKFILL ══════';
  RAISE NOTICE 'purchase_history  count=%', ph_count;
  RAISE NOTICE 'inventory_rules   count=%', hir_count;
END $$;
