-- =============================================================
-- Auth Trigger: Auto-create household + user profile on signup
-- Run this in the Supabase SQL Editor AFTER 00_init_schema.sql.
--
-- When a new user signs up via auth.users, this trigger:
--   1. Creates a new row in public.households
--   2. Creates a new row in public.users, linking auth.uid()
--      to the newly created household_id
--
-- This runs as SECURITY DEFINER so it bypasses RLS and can
-- write to public.households and public.users.
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id UUID;
BEGIN
  -- 1. Create a new household for this user
  INSERT INTO public.households (id, created_at)
  VALUES (gen_random_uuid(), now())
  RETURNING id INTO new_household_id;

  -- 2. Create the user profile linked to the new household
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

-- Attach the trigger to auth.users (fires after each INSERT)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================================
-- NOTE: If you want to allow users to JOIN an existing household
-- (e.g., via invite code), you would update public.users.household_id
-- after signup. This trigger creates a default "solo" household
-- so the user can start using the app immediately.
-- =============================================================
