-- =============================================================
-- Migration: leave_household() RPC
-- Run in Supabase SQL Editor
-- =============================================================

-- Creates a new solo household for the calling user and moves
-- them out of their current household. SECURITY DEFINER bypasses
-- RLS on the households table (no INSERT policy exists for regular users).

CREATE OR REPLACE FUNCTION public.leave_household()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_hh_id UUID;
BEGIN
  -- Create a fresh solo household
  INSERT INTO public.households DEFAULT VALUES
  RETURNING id INTO v_new_hh_id;

  -- Move the calling user into it
  UPDATE public.users
  SET household_id = v_new_hh_id
  WHERE id = auth.uid();

  RETURN json_build_object('success', true, 'household_id', v_new_hh_id);
END;
$$;
