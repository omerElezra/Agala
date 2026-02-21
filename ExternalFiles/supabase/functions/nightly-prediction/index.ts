// supabase/functions/nightly-prediction/index.ts
// ─────────────────────────────────────────────────────────────
// Supabase Edge Function — Nightly AI Prediction Engine
//
// Triggered by pg_cron every night at 02:00.
// Uses Service Role Key to bypass RLS (internal background job).
//
// Algorithm summary (from 03_Prediction_Logic.md):
//   1. Fetch all household_inventory_rules where the predicted
//      next-purchase date has passed:
//        last_purchased_at + (ema_days * quantity_modifier) <= now()
//   2. Evaluate confidence_score:
//        >= 85  → Auto-Add to shopping_list (status = 'active')
//        50-84  → Mark as 'suggest_only' (client shows in Suggestions)
//        < 50   → 'manual_only' (still learning, no action)
//   3. Recalculate EMA for products purchased since last run.
// ─────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.97.0';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// ── Constants ────────────────────────────────────────────────
const ALPHA = 0.3; // EMA smoothing factor
const CONFIDENCE_AUTO_ADD = 85;
const CONFIDENCE_SUGGEST = 50;

// ── Supabase client (service role — bypasses RLS) ────────────
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Types (minimal, matches the DB schema) ───────────────────
interface InventoryRule {
  id: string;
  household_id: string;
  product_id: string;
  ema_days: number;
  confidence_score: number;
  last_purchased_at: string | null;
  auto_add_status: 'auto_add' | 'suggest_only' | 'manual_only';
}

interface PurchaseRecord {
  purchased_at: string;
  quantity: number;
}

// ── Main handler ─────────────────────────────────────────────
serve(async (req: Request) => {
  try {
    // REQUIRED: verify the request comes from pg_cron via a shared secret.
    // The CRON_SECRET env var MUST be set in Supabase Dashboard → Edge Functions → Secrets.
    // Without it, the function refuses all requests (fail-closed).
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!cronSecret) {
      console.error('[nightly-prediction] CRON_SECRET is not configured. Aborting.');
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration: CRON_SECRET not set' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stats = { processed: 0, autoAdded: 0, suggested: 0, emaUpdated: 0, errors: 0 };

    // ── STEP 1: Recalculate EMA for recently purchased items ──
    await recalculateEMA(stats);

    // ── STEP 2: Evaluate rules and auto-add / suggest ─────────
    await evaluateRulesAndAct(stats);

    console.log('[nightly-prediction] completed:', stats);

    return new Response(JSON.stringify({ ok: true, stats }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[nightly-prediction] fatal error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

// ─────────────────────────────────────────────────────────────
// STEP 1: Recalculate EMA for all rules that have new purchases
//         since their last_purchased_at.
// ─────────────────────────────────────────────────────────────
async function recalculateEMA(stats: Record<string, number>): Promise<void> {
  // Fetch all inventory rules that have a last_purchased_at
  const { data: rules, error } = await supabase
    .from('household_inventory_rules')
    .select('*')
    .not('last_purchased_at', 'is', null);

  if (error) {
    console.error('[recalculateEMA] fetch rules error:', error.message);
    stats.errors++;
    return;
  }

  if (!rules || rules.length === 0) return;

  for (const rule of rules as InventoryRule[]) {
    // Find all purchases for this household+product that happened
    // AFTER the stored last_purchased_at, ordered chronologically.
    const { data: purchases, error: purchaseError } = await supabase
      .from('shopping_list')
      .select('purchased_at, quantity')
      .eq('household_id', rule.household_id)
      .eq('product_id', rule.product_id)
      .eq('status', 'purchased')
      .gt('purchased_at', rule.last_purchased_at!)
      .order('purchased_at', { ascending: true });

    if (purchaseError) {
      console.error(
        `[recalculateEMA] purchase fetch error for rule ${rule.id}:`,
        purchaseError.message,
      );
      stats.errors++;
      continue;
    }

    if (!purchases || purchases.length === 0) continue;

    // Walk through new purchases and iteratively apply EMA formula
    let currentEma = rule.ema_days;
    let previousDate = new Date(rule.last_purchased_at!);
    let latestPurchasedAt = rule.last_purchased_at!;
    let latestQuantity = 1;
    let confidenceScore = rule.confidence_score;

    for (const purchase of purchases as PurchaseRecord[]) {
      const purchaseDate = new Date(purchase.purchased_at);
      const intervalDays =
        (purchaseDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24);

      if (intervalDays <= 0) continue; // skip same-day duplicates

      // EMA_new = α · CurrentInterval + (1 - α) · EMA_old
      if (currentEma === 0) {
        // First purchase pair: seed EMA with the raw interval
        currentEma = intervalDays;
      } else {
        currentEma = ALPHA * intervalDays + (1 - ALPHA) * currentEma;
      }

      // Positive signal: purchase within 15% of predicted interval → +10
      const predictedInterval = rule.ema_days > 0 ? rule.ema_days : intervalDays;
      const variance = Math.abs(intervalDays - predictedInterval) / predictedInterval;
      if (variance <= 0.15) {
        confidenceScore = Math.min(100, confidenceScore + 10);
      }

      previousDate = purchaseDate;
      latestPurchasedAt = purchase.purchased_at;
      latestQuantity = purchase.quantity ?? 1;
      stats.emaUpdated++;
    }

    // Determine auto_add_status based on updated confidence
    const autoAddStatus = deriveAutoAddStatus(confidenceScore);

    // Persist updated rule
    const { error: updateError } = await supabase
      .from('household_inventory_rules')
      .update({
        ema_days: Math.round(currentEma * 100) / 100, // 2 decimal precision
        confidence_score: Math.round(confidenceScore * 100) / 100,
        last_purchased_at: latestPurchasedAt,
        auto_add_status: autoAddStatus,
      })
      .eq('id', rule.id);

    if (updateError) {
      console.error(`[recalculateEMA] update error for rule ${rule.id}:`, updateError.message);
      stats.errors++;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// STEP 2: For rules whose predicted next-purchase date has
//         passed, auto-add or mark as suggest.
//
//   NextDate = last_purchased_at + (ema_days × quantity_modifier)
//
//   We check: NextDate <= NOW()
// ─────────────────────────────────────────────────────────────
async function evaluateRulesAndAct(stats: Record<string, number>): Promise<void> {
  const now = new Date();

  // Fetch rules with enough data to predict (ema_days > 0)
  const { data: rules, error } = await supabase
    .from('household_inventory_rules')
    .select('*')
    .gt('ema_days', 0)
    .not('last_purchased_at', 'is', null);

  if (error) {
    console.error('[evaluateRules] fetch error:', error.message);
    stats.errors++;
    return;
  }

  if (!rules || rules.length === 0) return;

  for (const rule of rules as InventoryRule[]) {
    // Calculate the predicted next-purchase date
    // The quantity_modifier is derived from the last purchase's quantity.
    // We fetch the most recent purchase to get the quantity.
    const { data: lastPurchase } = await supabase
      .from('shopping_list')
      .select('quantity')
      .eq('household_id', rule.household_id)
      .eq('product_id', rule.product_id)
      .eq('status', 'purchased')
      .order('purchased_at', { ascending: false })
      .limit(1)
      .single();

    const quantityModifier = lastPurchase?.quantity ?? 1;
    const lastPurchasedAt = new Date(rule.last_purchased_at!);
    const nextPredictedDate = new Date(
      lastPurchasedAt.getTime() + rule.ema_days * quantityModifier * 24 * 60 * 60 * 1000,
    );

    // Only act if the predicted date has passed (item is "due")
    if (nextPredictedDate > now) continue;

    stats.processed++;

    // ── Confidence >= 85 → Auto-Add ──────────────────────────
    if (rule.confidence_score >= CONFIDENCE_AUTO_ADD) {
      // Check if the product is already active on the shopping list
      const { data: existing } = await supabase
        .from('shopping_list')
        .select('id')
        .eq('household_id', rule.household_id)
        .eq('product_id', rule.product_id)
        .eq('status', 'active')
        .limit(1);

      if (existing && existing.length > 0) {
        // Already on the list — skip
        continue;
      }

      // Also skip if snoozed and snooze window hasn't expired
      const { data: snoozed } = await supabase
        .from('shopping_list')
        .select('id, snooze_until')
        .eq('household_id', rule.household_id)
        .eq('product_id', rule.product_id)
        .eq('status', 'snoozed')
        .limit(1);

      if (snoozed && snoozed.length > 0) {
        const snoozeUntil = snoozed[0]?.snooze_until;
        if (snoozeUntil && new Date(snoozeUntil) > now) {
          continue; // Still snoozed — respect user's intent
        }
      }

      // Insert into shopping_list as auto-added
      const { error: insertError } = await supabase.from('shopping_list').insert({
        household_id: rule.household_id,
        product_id: rule.product_id,
        quantity: 1,
        status: 'active',
      });

      if (insertError) {
        console.error(`[evaluateRules] auto-add insert error:`, insertError.message);
        stats.errors++;
      } else {
        stats.autoAdded++;
      }

      // Ensure rule status reflects auto_add
      if (rule.auto_add_status !== 'auto_add') {
        await supabase
          .from('household_inventory_rules')
          .update({ auto_add_status: 'auto_add' })
          .eq('id', rule.id);
      }
    }
    // ── Confidence 50-84 → Suggest ───────────────────────────
    else if (rule.confidence_score >= CONFIDENCE_SUGGEST) {
      // Ensure the rule is flagged as suggest_only so the client
      // picks it up in the Suggestions UI section.
      if (rule.auto_add_status !== 'suggest_only') {
        const { error: updateError } = await supabase
          .from('household_inventory_rules')
          .update({ auto_add_status: 'suggest_only' })
          .eq('id', rule.id);

        if (updateError) {
          console.error(`[evaluateRules] suggest update error:`, updateError.message);
          stats.errors++;
        } else {
          stats.suggested++;
        }
      } else {
        stats.suggested++;
      }
    }
    // ── Confidence < 50 → Manual (no action) ─────────────────
    // The algorithm is still learning. No UI action taken.
  }
}

// ── Helper: derive auto_add_status from confidence score ─────
function deriveAutoAddStatus(
  score: number,
): 'auto_add' | 'suggest_only' | 'manual_only' {
  if (score >= CONFIDENCE_AUTO_ADD) return 'auto_add';
  if (score >= CONFIDENCE_SUGGEST) return 'suggest_only';
  return 'manual_only';
}
