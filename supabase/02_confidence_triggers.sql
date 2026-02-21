-- =============================================================
-- Confidence Score Penalty Triggers
-- Run this in the Supabase SQL Editor AFTER 00_init_schema.sql.
--
-- These triggers automatically adjust the confidence_score in
-- household_inventory_rules when a user snoozes or deletes
-- an auto-added item from the shopping_list.
--
-- From 03_Prediction_Logic.md:
--   - Swiping/Deleting an Auto-Added item:  -20
--   - Using the "Snooze" feature:            -15
-- =============================================================

-- ── 1. Penalty function for status changes (snooze) ──────────
CREATE OR REPLACE FUNCTION public.handle_confidence_penalty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auto_add_status TEXT;
  v_penalty         NUMERIC;
BEGIN
  -- Only act when status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Look up whether this product is auto-added for this household
  SELECT auto_add_status INTO v_auto_add_status
  FROM public.household_inventory_rules
  WHERE household_id = NEW.household_id
    AND product_id = NEW.product_id;

  -- Only apply penalty for auto-added items
  IF v_auto_add_status IS NULL OR v_auto_add_status != 'auto_add' THEN
    RETURN NEW;
  END IF;

  -- Determine penalty based on action
  IF NEW.status = 'snoozed' AND OLD.status = 'active' THEN
    v_penalty := -15;
  ELSE
    RETURN NEW;
  END IF;

  -- Apply penalty (clamp to 0-100)
  UPDATE public.household_inventory_rules
  SET confidence_score = GREATEST(0, LEAST(100, confidence_score + v_penalty)),
      auto_add_status = CASE
        WHEN GREATEST(0, LEAST(100, confidence_score + v_penalty)) >= 85 THEN 'auto_add'
        WHEN GREATEST(0, LEAST(100, confidence_score + v_penalty)) >= 50 THEN 'suggest_only'
        ELSE 'manual_only'
      END
  WHERE household_id = NEW.household_id
    AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

-- ── 2. Penalty function for deletes (remove item) ────────────
CREATE OR REPLACE FUNCTION public.handle_delete_confidence_penalty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auto_add_status TEXT;
BEGIN
  -- Look up whether this product is auto-added
  SELECT auto_add_status INTO v_auto_add_status
  FROM public.household_inventory_rules
  WHERE household_id = OLD.household_id
    AND product_id = OLD.product_id;

  -- Only penalize deletions of auto-added items that were active
  IF v_auto_add_status IS NULL OR v_auto_add_status != 'auto_add' THEN
    RETURN OLD;
  END IF;

  IF OLD.status != 'active' THEN
    RETURN OLD;
  END IF;

  -- -20 penalty for deleting an auto-added item
  UPDATE public.household_inventory_rules
  SET confidence_score = GREATEST(0, LEAST(100, confidence_score - 20)),
      auto_add_status = CASE
        WHEN GREATEST(0, LEAST(100, confidence_score - 20)) >= 85 THEN 'auto_add'
        WHEN GREATEST(0, LEAST(100, confidence_score - 20)) >= 50 THEN 'suggest_only'
        ELSE 'manual_only'
      END
  WHERE household_id = OLD.household_id
    AND product_id = OLD.product_id;

  RETURN OLD;
END;
$$;

-- ── 3. Positive signal: accepting a suggestion → +15 ─────────
-- When a user inserts an item whose product has a 'suggest_only'
-- rule, that acceptance adds +15 to confidence.
CREATE OR REPLACE FUNCTION public.handle_suggestion_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auto_add_status TEXT;
BEGIN
  -- Check if the inserted product has a suggest_only rule
  SELECT auto_add_status INTO v_auto_add_status
  FROM public.household_inventory_rules
  WHERE household_id = NEW.household_id
    AND product_id = NEW.product_id;

  IF v_auto_add_status IS NULL OR v_auto_add_status != 'suggest_only' THEN
    RETURN NEW;
  END IF;

  -- +15 for manual acceptance of a suggested item
  UPDATE public.household_inventory_rules
  SET confidence_score = GREATEST(0, LEAST(100, confidence_score + 15)),
      auto_add_status = CASE
        WHEN GREATEST(0, LEAST(100, confidence_score + 15)) >= 85 THEN 'auto_add'
        WHEN GREATEST(0, LEAST(100, confidence_score + 15)) >= 50 THEN 'suggest_only'
        ELSE 'manual_only'
      END
  WHERE household_id = NEW.household_id
    AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

-- ── 4. Attach triggers ──────────────────────────────────────

-- Snooze penalty (on UPDATE)
CREATE TRIGGER trg_confidence_penalty_on_snooze
  AFTER UPDATE ON public.shopping_list
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_confidence_penalty();

-- Delete penalty (on DELETE)
CREATE TRIGGER trg_confidence_penalty_on_delete
  BEFORE DELETE ON public.shopping_list
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_delete_confidence_penalty();

-- Suggestion acceptance bonus (on INSERT)
CREATE TRIGGER trg_confidence_bonus_on_accept
  AFTER INSERT ON public.shopping_list
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_suggestion_acceptance();
