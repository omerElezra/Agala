-- =============================================================
-- Smart Grocery List App — Full Supabase SQL Migration
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================

-- 0. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
-- NOTE: pg_cron is only available on Supabase Pro plan.
-- On Free plan, use GitHub Actions or external cron instead.
-- CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- =============================================================
-- 1. TABLES
-- =============================================================

-- 1.1 Households
CREATE TABLE public.households (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.2 Users (linked to Supabase Auth)
CREATE TABLE public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.3 Products (Medium-Resolution Catalog)
CREATE TABLE public.products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  category              TEXT,
  is_custom             BOOLEAN NOT NULL DEFAULT false,
  created_by_household  UUID REFERENCES public.households(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1.4 Shopping List (Active + Historical)
CREATE TABLE public.shopping_list (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'purchased', 'snoozed')),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  purchased_at  TIMESTAMPTZ,
  snooze_until  TIMESTAMPTZ
);

-- 1.5 Household Inventory Rules (AI Prediction State)
CREATE TABLE public.household_inventory_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  ema_days          NUMERIC NOT NULL DEFAULT 0,
  confidence_score  NUMERIC NOT NULL DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  last_purchased_at TIMESTAMPTZ,
  auto_add_status   TEXT NOT NULL DEFAULT 'manual_only'
                      CHECK (auto_add_status IN ('auto_add', 'suggest_only', 'manual_only')),
  UNIQUE (household_id, product_id)
);

-- =============================================================
-- 2. INDEXES (performance for common queries)
-- =============================================================

CREATE INDEX idx_users_household        ON public.users(household_id);
CREATE INDEX idx_shopping_list_household ON public.shopping_list(household_id);
CREATE INDEX idx_shopping_list_status    ON public.shopping_list(household_id, status);
CREATE INDEX idx_inventory_rules_hh     ON public.household_inventory_rules(household_id);
CREATE INDEX idx_products_category      ON public.products(category);

-- =============================================================
-- 3. HELPER FUNCTION — get the household_id for the current user
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_my_household_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT household_id FROM public.users WHERE id = auth.uid();
$$;

-- =============================================================
-- 4. ENABLE RLS ON ALL TABLES
-- =============================================================

ALTER TABLE public.households               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_inventory_rules ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- 5. RLS POLICIES
-- =============================================================

-- -------------------- households --------------------
-- Users can only see their own household
CREATE POLICY "Users can view own household"
  ON public.households FOR SELECT
  USING (id = public.get_my_household_id());

-- Allow insert during onboarding (user creates a household)
CREATE POLICY "Authenticated users can create a household"
  ON public.households FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- -------------------- users --------------------
-- A user can see other members of the same household
CREATE POLICY "Users can view household members"
  ON public.users FOR SELECT
  USING (household_id = public.get_my_household_id());

-- A user can insert themselves (signup flow)
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  WITH CHECK (id = auth.uid());

-- A user can update only their own profile
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- -------------------- products --------------------
-- Everyone can read global products (is_custom = false)
-- Household members can read their own custom products
CREATE POLICY "Users can view products"
  ON public.products FOR SELECT
  USING (
    is_custom = false
    OR created_by_household = public.get_my_household_id()
  );

-- Household members can create custom products
CREATE POLICY "Users can insert custom products"
  ON public.products FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      is_custom = false  -- global catalog (admin/seed only in practice)
      OR created_by_household = public.get_my_household_id()
    )
  );

-- Household members can update their own custom products
CREATE POLICY "Users can update own custom products"
  ON public.products FOR UPDATE
  USING (created_by_household = public.get_my_household_id())
  WITH CHECK (created_by_household = public.get_my_household_id());

-- -------------------- shopping_list --------------------
CREATE POLICY "Users can view own household shopping list"
  ON public.shopping_list FOR SELECT
  USING (household_id = public.get_my_household_id());

CREATE POLICY "Users can insert into own household shopping list"
  ON public.shopping_list FOR INSERT
  WITH CHECK (household_id = public.get_my_household_id());

CREATE POLICY "Users can update own household shopping list"
  ON public.shopping_list FOR UPDATE
  USING (household_id = public.get_my_household_id())
  WITH CHECK (household_id = public.get_my_household_id());

CREATE POLICY "Users can delete from own household shopping list"
  ON public.shopping_list FOR DELETE
  USING (household_id = public.get_my_household_id());

-- -------------------- household_inventory_rules --------------------
CREATE POLICY "Users can view own household inventory rules"
  ON public.household_inventory_rules FOR SELECT
  USING (household_id = public.get_my_household_id());

CREATE POLICY "Users can insert own household inventory rules"
  ON public.household_inventory_rules FOR INSERT
  WITH CHECK (household_id = public.get_my_household_id());

CREATE POLICY "Users can update own household inventory rules"
  ON public.household_inventory_rules FOR UPDATE
  USING (household_id = public.get_my_household_id())
  WITH CHECK (household_id = public.get_my_household_id());

-- =============================================================
-- 6. ENABLE REALTIME on tables that need live sync
-- =============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list;
ALTER PUBLICATION supabase_realtime ADD TABLE public.household_inventory_rules;

-- =============================================================
-- 7. SEED DATA — sample global products (optional)
-- =============================================================

INSERT INTO public.products (name, category, is_custom, created_by_household) VALUES
  ('חלב 3%',        'מוצרי חלב',  false, NULL),
  ('גבינה צהובה 200 גרם', 'מוצרי חלב', false, NULL),
  ('לחם פרוס',      'מאפים',      false, NULL),
  ('ביצים 12',      'ביצים',      false, NULL),
  ('עגבניות',       'ירקות',      false, NULL),
  ('מלפפונים',      'ירקות',      false, NULL),
  ('בננות',         'פירות',      false, NULL),
  ('תפוחים',        'פירות',      false, NULL),
  ('חזה עוף',       'בשר ועוף',   false, NULL),
  ('אורז 1 ק"ג',   'יבשים',      false, NULL),
  ('פסטה 500 גרם',  'יבשים',      false, NULL),
  ('שמן זית',       'שמנים',      false, NULL),
  ('נייר טואלט',    'ניקיון',     false, NULL),
  ('סבון כלים',     'ניקיון',     false, NULL),
  ('קפה טורקי',     'משקאות',     false, NULL);
