-- ============================================================
-- DIAGNOSTIC + FIX (v3)
-- Paste this ENTIRE script in Supabase SQL Editor
-- Check BOTH the "Results" tab AND the "Messages" tab
-- ============================================================

-- ── 1. COUNT all tables (this is a SELECT, so it shows in Results) ──
SELECT 
  (SELECT COUNT(*) FROM public.shopping_list) AS shopping_list_total,
  (SELECT COUNT(*) FROM public.shopping_list WHERE status = 'active') AS sl_active,
  (SELECT COUNT(*) FROM public.shopping_list WHERE status = 'purchased') AS sl_purchased,
  (SELECT COUNT(*) FROM public.purchase_history) AS purchase_history_total,
  (SELECT COUNT(*) FROM public.household_inventory_rules) AS inventory_rules_total,
  (SELECT COUNT(*) FROM public.products) AS products_total,
  (SELECT COUNT(*) FROM public.users) AS users_total,
  (SELECT COUNT(*) FROM public.households) AS households_total;
