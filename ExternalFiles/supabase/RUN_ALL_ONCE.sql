-- =============================================================
-- AGALA — Complete Database Setup (Paste this ONCE in Supabase SQL Editor)
-- This combines: 00_init_schema + 03_auth_trigger + 02_confidence_triggers + backfill
-- =============================================================

-- ▸▸▸ PART 1: Schema (from 00_init_schema.sql) ▸▸▸

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TABLES
CREATE TABLE IF NOT EXISTS public.households (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id  UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  category              TEXT,
  is_custom             BOOLEAN NOT NULL DEFAULT false,
  created_by_household  UUID REFERENCES public.households(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shopping_list (
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

CREATE TABLE IF NOT EXISTS public.household_inventory_rules (
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

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_users_household        ON public.users(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_household ON public.shopping_list(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_status    ON public.shopping_list(household_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_rules_hh     ON public.household_inventory_rules(household_id);
CREATE INDEX IF NOT EXISTS idx_products_category      ON public.products(category);

-- 3. HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.get_my_household_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT household_id FROM public.users WHERE id = auth.uid();
$$;

-- 4. ENABLE RLS
ALTER TABLE public.households               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_inventory_rules ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES (using DO block to avoid "already exists" errors)
DO $$ BEGIN
  -- households
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own household' AND tablename = 'households') THEN
    CREATE POLICY "Users can view own household" ON public.households FOR SELECT USING (id = public.get_my_household_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can create a household' AND tablename = 'households') THEN
    CREATE POLICY "Authenticated users can create a household" ON public.households FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;

  -- users
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view household members' AND tablename = 'users') THEN
    CREATE POLICY "Users can view household members" ON public.users FOR SELECT USING (household_id = public.get_my_household_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own profile' AND tablename = 'users') THEN
    CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile' AND tablename = 'users') THEN
    CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
  END IF;

  -- products
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view products' AND tablename = 'products') THEN
    CREATE POLICY "Users can view products" ON public.products FOR SELECT USING (is_custom = false OR created_by_household = public.get_my_household_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert custom products' AND tablename = 'products') THEN
    CREATE POLICY "Users can insert custom products" ON public.products FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (is_custom = false OR created_by_household = public.get_my_household_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own custom products' AND tablename = 'products') THEN
    CREATE POLICY "Users can update own custom products" ON public.products FOR UPDATE USING (created_by_household = public.get_my_household_id()) WITH CHECK (created_by_household = public.get_my_household_id());
  END IF;

  -- shopping_list
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own household shopping list' AND tablename = 'shopping_list') THEN
    CREATE POLICY "Users can view own household shopping list" ON public.shopping_list FOR SELECT USING (household_id = public.get_my_household_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert into own household shopping list' AND tablename = 'shopping_list') THEN
    CREATE POLICY "Users can insert into own household shopping list" ON public.shopping_list FOR INSERT WITH CHECK (household_id = public.get_my_household_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own household shopping list' AND tablename = 'shopping_list') THEN
    CREATE POLICY "Users can update own household shopping list" ON public.shopping_list FOR UPDATE USING (household_id = public.get_my_household_id()) WITH CHECK (household_id = public.get_my_household_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete from own household shopping list' AND tablename = 'shopping_list') THEN
    CREATE POLICY "Users can delete from own household shopping list" ON public.shopping_list FOR DELETE USING (household_id = public.get_my_household_id());
  END IF;

  -- household_inventory_rules
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own household inventory rules' AND tablename = 'household_inventory_rules') THEN
    CREATE POLICY "Users can view own household inventory rules" ON public.household_inventory_rules FOR SELECT USING (household_id = public.get_my_household_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own household inventory rules' AND tablename = 'household_inventory_rules') THEN
    CREATE POLICY "Users can insert own household inventory rules" ON public.household_inventory_rules FOR INSERT WITH CHECK (household_id = public.get_my_household_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own household inventory rules' AND tablename = 'household_inventory_rules') THEN
    CREATE POLICY "Users can update own household inventory rules" ON public.household_inventory_rules FOR UPDATE USING (household_id = public.get_my_household_id()) WITH CHECK (household_id = public.get_my_household_id());
  END IF;
END $$;

-- 6. ENABLE REALTIME
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.household_inventory_rules;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. SEED DATA — Hebrew product catalog
INSERT INTO public.products (name, category, is_custom, created_by_household)
SELECT name, category, false, NULL
FROM (VALUES
  ('חלב 3%',        'מוצרי חלב'),
  ('גבינה צהובה 200 גרם', 'מוצרי חלב'),
  ('לחם פרוס',      'מאפים'),
  ('ביצים 12',      'ביצים'),
  ('עגבניות',       'ירקות'),
  ('מלפפונים',      'ירקות'),
  ('בננות',         'פירות'),
  ('תפוחים',        'פירות'),
  ('חזה עוף',       'בשר ועוף'),
  ('אורז 1 ק"ג',   'יבשים'),
  ('פסטה 500 גרם',  'יבשים'),
  ('שמן זית',       'שמנים'),
  ('נייר טואלט',    'ניקיון'),
  ('סבון כלים',     'ניקיון'),
  ('קפה טורקי',     'משקאות')
) AS seed(name, category)
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE products.name = seed.name AND products.is_custom = false);


-- ▸▸▸ PART 2: Auth Trigger (from 03_auth_trigger.sql) ▸▸▸

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id UUID;
BEGIN
  INSERT INTO public.households (id, created_at)
  VALUES (gen_random_uuid(), now())
  RETURNING id INTO new_household_id;

  INSERT INTO public.users (id, household_id, email, display_name, created_at)
  VALUES (
    NEW.id,
    new_household_id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ▸▸▸ PART 3: Confidence Triggers (from 02_confidence_triggers.sql) ▸▸▸

-- Snooze penalty function
CREATE OR REPLACE FUNCTION public.handle_confidence_penalty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auto_add_status TEXT;
  v_penalty         NUMERIC;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT auto_add_status INTO v_auto_add_status
  FROM public.household_inventory_rules
  WHERE household_id = NEW.household_id AND product_id = NEW.product_id;

  IF v_auto_add_status IS NULL OR v_auto_add_status != 'auto_add' THEN RETURN NEW; END IF;

  IF NEW.status = 'snoozed' AND OLD.status = 'active' THEN
    v_penalty := -15;
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.household_inventory_rules
  SET confidence_score = GREATEST(0, LEAST(100, confidence_score + v_penalty)),
      auto_add_status = CASE
        WHEN GREATEST(0, LEAST(100, confidence_score + v_penalty)) >= 85 THEN 'auto_add'
        WHEN GREATEST(0, LEAST(100, confidence_score + v_penalty)) >= 50 THEN 'suggest_only'
        ELSE 'manual_only'
      END
  WHERE household_id = NEW.household_id AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

-- Delete penalty function
CREATE OR REPLACE FUNCTION public.handle_delete_confidence_penalty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auto_add_status TEXT;
BEGIN
  SELECT auto_add_status INTO v_auto_add_status
  FROM public.household_inventory_rules
  WHERE household_id = OLD.household_id AND product_id = OLD.product_id;

  IF v_auto_add_status IS NULL OR v_auto_add_status != 'auto_add' THEN RETURN OLD; END IF;
  IF OLD.status != 'active' THEN RETURN OLD; END IF;

  UPDATE public.household_inventory_rules
  SET confidence_score = GREATEST(0, LEAST(100, confidence_score - 20)),
      auto_add_status = CASE
        WHEN GREATEST(0, LEAST(100, confidence_score - 20)) >= 85 THEN 'auto_add'
        WHEN GREATEST(0, LEAST(100, confidence_score - 20)) >= 50 THEN 'suggest_only'
        ELSE 'manual_only'
      END
  WHERE household_id = OLD.household_id AND product_id = OLD.product_id;

  RETURN OLD;
END;
$$;

-- Suggestion acceptance function
CREATE OR REPLACE FUNCTION public.handle_suggestion_acceptance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auto_add_status TEXT;
BEGIN
  SELECT auto_add_status INTO v_auto_add_status
  FROM public.household_inventory_rules
  WHERE household_id = NEW.household_id AND product_id = NEW.product_id;

  IF v_auto_add_status IS NULL OR v_auto_add_status != 'suggest_only' THEN RETURN NEW; END IF;

  UPDATE public.household_inventory_rules
  SET confidence_score = GREATEST(0, LEAST(100, confidence_score + 15)),
      auto_add_status = CASE
        WHEN GREATEST(0, LEAST(100, confidence_score + 15)) >= 85 THEN 'auto_add'
        WHEN GREATEST(0, LEAST(100, confidence_score + 15)) >= 50 THEN 'suggest_only'
        ELSE 'manual_only'
      END
  WHERE household_id = NEW.household_id AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$;

-- Attach confidence triggers (drop first to be idempotent)
DROP TRIGGER IF EXISTS trg_confidence_penalty_on_snooze ON public.shopping_list;
CREATE TRIGGER trg_confidence_penalty_on_snooze
  AFTER UPDATE ON public.shopping_list
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_confidence_penalty();

DROP TRIGGER IF EXISTS trg_confidence_penalty_on_delete ON public.shopping_list;
CREATE TRIGGER trg_confidence_penalty_on_delete
  BEFORE DELETE ON public.shopping_list
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_delete_confidence_penalty();

DROP TRIGGER IF EXISTS trg_confidence_bonus_on_accept ON public.shopping_list;
CREATE TRIGGER trg_confidence_bonus_on_accept
  AFTER INSERT ON public.shopping_list
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_suggestion_acceptance();


-- ▸▸▸ PART 4: Backfill existing auth users ▸▸▸

DO $$
DECLARE
  u RECORD;
  new_hid UUID;
BEGIN
  FOR u IN SELECT id, email, raw_user_meta_data FROM auth.users
           WHERE id NOT IN (SELECT id FROM public.users)
  LOOP
    INSERT INTO public.households (id, created_at)
    VALUES (gen_random_uuid(), now())
    RETURNING id INTO new_hid;

    INSERT INTO public.users (id, household_id, email, display_name, created_at)
    VALUES (
      u.id,
      new_hid,
      COALESCE(u.email, ''),
      COALESCE(u.raw_user_meta_data->>'display_name', ''),
      now()
    );
  END LOOP;
END;
$$;

-- ✅ DONE! Verify with:
-- SELECT * FROM public.households;
-- SELECT * FROM public.users;
-- SELECT * FROM public.products;
