-- =============================================================
-- pg_cron Scheduling for Nightly AI Prediction Engine
-- Run this in the Supabase SQL Editor AFTER deploying the Edge Function.
-- =============================================================
--
-- Prerequisites:
--   1. pg_cron extension is already enabled (done in 00_init_schema.sql).
--   2. The Edge Function "nightly-prediction" is deployed:
--        supabase functions deploy nightly-prediction --no-verify-jwt
--   3. The following secrets are set in Supabase Dashboard → Edge Functions:
--        - SUPABASE_URL         (auto-set by Supabase)
--        - SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
--        - CRON_SECRET          (optional — for extra auth layer)
--
-- How it works:
--   pg_cron fires an HTTP POST to the Edge Function every night at 02:00 UTC.
--   The function uses the Service Role Key (bypasses RLS) to read/write
--   household_inventory_rules and shopping_list.
-- =============================================================

-- ── 1. Schedule the cron job ─────────────────────────────────
-- Runs every day at 02:00 UTC.
-- If you want a different timezone, adjust the cron expression
-- or use pg_cron's timezone parameter (Supabase uses UTC by default).

SELECT cron.schedule(
  'nightly-prediction-engine',        -- unique job name
  '0 2 * * *',                         -- cron expression: daily at 02:00
  $$
  SELECT
    net.http_post(
      -- URL: your Supabase project Edge Function endpoint
      url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/nightly-prediction',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- Authenticate with the CRON_SECRET so the Edge Function
        -- can verify the caller is the internal pg_cron job.
        -- Store your secret in a Vault secret or app.settings:
        --   ALTER DATABASE postgres SET app.settings.cron_secret = '<YOUR_CRON_SECRET>';
        'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- ── 2. Verify the job was created ───────────────────────────
-- Run this query to confirm:
--   SELECT * FROM cron.job WHERE jobname = 'nightly-prediction-engine';

-- ── 3. (Optional) Manual trigger for testing ─────────────────
-- To invoke the function immediately without waiting for 02:00:
--
--   SELECT
--     net.http_post(
--       url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/nightly-prediction',
--       headers := jsonb_build_object(
--         'Content-Type', 'application/json',
--         'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
--       ),
--       body := '{}'::jsonb
--     ) AS request_id;

-- ── 4. (Optional) Unschedule the job ────────────────────────
-- If you need to remove the cron job:
--   SELECT cron.unschedule('nightly-prediction-engine');

-- =============================================================
-- ALTERNATIVE: Using CRON_SECRET for extra auth
-- =============================================================
-- If you set a CRON_SECRET environment variable on the Edge Function,
-- replace the Authorization header with:
--
--   'Authorization', 'Bearer <YOUR_CRON_SECRET>'
--
-- This adds a second layer of security: the Edge Function verifies
-- the CRON_SECRET header before processing, AND uses the
-- SUPABASE_SERVICE_ROLE_KEY internally for DB operations.
-- =============================================================
