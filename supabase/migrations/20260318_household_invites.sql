-- =============================================================
-- Migration: Household invites — name + short invite codes
-- Run in Supabase SQL Editor
-- =============================================================

-- 1. Add 'name' column to households
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS name TEXT;

-- 2. Create household_invites table
CREATE TABLE IF NOT EXISTS public.household_invites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  code           TEXT NOT NULL UNIQUE,
  created_by     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  uses_remaining INTEGER NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS idx_invites_code ON public.household_invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_household ON public.household_invites(household_id);

-- 3. RLS for household_invites
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;

-- Members can view their own household's invites
DROP POLICY IF EXISTS "Members can view own invites" ON public.household_invites;
CREATE POLICY "Members can view own invites"
  ON public.household_invites FOR SELECT
  USING (household_id = public.get_my_household_id());

-- Members can create invites for their household
DROP POLICY IF EXISTS "Members can create invites" ON public.household_invites;
CREATE POLICY "Members can create invites"
  ON public.household_invites FOR INSERT
  WITH CHECK (household_id = public.get_my_household_id());

-- Members can delete (revoke) their own household's invites
DROP POLICY IF EXISTS "Members can delete own invites" ON public.household_invites;
CREATE POLICY "Members can delete own invites"
  ON public.household_invites FOR DELETE
  USING (household_id = public.get_my_household_id());

-- ANYONE authenticated can look up an invite by code (needed for joining)
DROP POLICY IF EXISTS "Anyone can lookup invite by code" ON public.household_invites;
CREATE POLICY "Anyone can lookup invite by code"
  ON public.household_invites FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 4. RPC: join household via invite code
-- Bypasses RLS to validate invite + update user's household_id atomically
CREATE OR REPLACE FUNCTION public.join_household_by_code(invite_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite  RECORD;
  v_hh_name TEXT;
BEGIN
  -- Find valid (non-expired, uses remaining) invite
  SELECT * INTO v_invite
  FROM public.household_invites
  WHERE code = upper(invite_code)
    AND expires_at > now()
    AND uses_remaining > 0;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'INVITE_NOT_FOUND');
  END IF;

  -- Guard: already a member of this household
  IF v_invite.household_id = public.get_my_household_id() THEN
    RETURN json_build_object('success', false, 'error', 'ALREADY_MEMBER');
  END IF;

  -- Get household name
  SELECT name INTO v_hh_name
  FROM public.households
  WHERE id = v_invite.household_id;

  -- Update user's household
  UPDATE public.users
  SET household_id = v_invite.household_id
  WHERE id = auth.uid();

  -- Decrement uses
  UPDATE public.household_invites
  SET uses_remaining = uses_remaining - 1
  WHERE id = v_invite.id;

  RETURN json_build_object(
    'success', true,
    'household_id', v_invite.household_id,
    'household_name', COALESCE(v_hh_name, '')
  );
END;
$$;

-- 5. Allow households UPDATE for members (to set name)
DROP POLICY IF EXISTS "Members can update own household" ON public.households;
CREATE POLICY "Members can update own household"
  ON public.households FOR UPDATE
  USING (id = public.get_my_household_id())
  WITH CHECK (id = public.get_my_household_id());
