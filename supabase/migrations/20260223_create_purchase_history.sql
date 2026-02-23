-- ============================================================
-- purchase_history: immutable transaction log for every purchase
-- Used for analytics, buy-cycle predictions, and EMA confidence.
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_history (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    INT  NOT NULL DEFAULT 1,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast household + date lookups
CREATE INDEX IF NOT EXISTS idx_purchase_history_household
  ON purchase_history (household_id, purchased_at DESC);

-- Index for per-product analytics
CREATE INDEX IF NOT EXISTS idx_purchase_history_product
  ON purchase_history (household_id, product_id, purchased_at DESC);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE purchase_history ENABLE ROW LEVEL SECURITY;

-- Users can read their own household's history
DROP POLICY IF EXISTS "Users can read own household purchase history" ON purchase_history;
CREATE POLICY "Users can read own household purchase history"
  ON purchase_history FOR SELECT
  USING (household_id = (SELECT get_my_household_id()));

-- Users can insert into their own household's history
DROP POLICY IF EXISTS "Users can insert own household purchase history" ON purchase_history;
CREATE POLICY "Users can insert own household purchase history"
  ON purchase_history FOR INSERT
  WITH CHECK (household_id = (SELECT get_my_household_id()));

-- Users can delete their own household's history records
DROP POLICY IF EXISTS "Users can delete own household purchase history" ON purchase_history;
CREATE POLICY "Users can delete own household purchase history"
  ON purchase_history FOR DELETE
  USING (household_id = (SELECT get_my_household_id()));

-- ── Backfill existing purchase data ──────────────────────────
-- Copy existing purchased items from shopping_list into purchase_history
INSERT INTO purchase_history (household_id, product_id, quantity, purchased_at)
SELECT household_id, product_id, quantity, COALESCE(purchased_at, now())
FROM shopping_list
WHERE status = 'purchased'
  AND purchased_at IS NOT NULL
ON CONFLICT DO NOTHING;
