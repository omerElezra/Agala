import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ── Types ────────────────────────────────────────────────────
type ShoppingListRow = Database['public']['Tables']['shopping_list']['Row'];
type ProductRow = Database['public']['Tables']['products']['Row'];
type InventoryRuleRow = Database['public']['Tables']['household_inventory_rules']['Row'];

/** An item currently on the shopping list (active, purchased, or snoozed). */
export interface ShoppingItem extends ShoppingListRow {
  product: ProductRow | null;
}

/** A suggestion sourced from household_inventory_rules (confidence 50-84). */
export interface SuggestionItem {
  id: string; // household_inventory_rules.id
  productId: string;
  product: ProductRow;
  confidenceScore: number;
}

interface PendingPurchase {
  itemId: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface OfflineAction {
  itemId: string;
  purchasedAt: string;
}

interface ShoppingListState {
  // ── Data ─────────────────────────────────────────────────
  items: ShoppingItem[];
  suggestions: SuggestionItem[];
  isLoading: boolean;
  householdId: string | null;

  /** Product IDs whose inventory rule is auto_add — used to split the UI
   *  into "Auto-Added" vs "Manually Added" sections. */
  autoAddedProductIds: Set<string>;

  // ── Offline / optimistic ─────────────────────────────────
  offlineQueue: OfflineAction[];
  pendingPurchases: Map<string, PendingPurchase>;

  // ── Actions ──────────────────────────────────────────────
  fetchList: (householdId: string) => Promise<void>;
  fetchSuggestions: (householdId: string) => Promise<void>;
  subscribeRealtime: (householdId: string) => () => void;
  checkOffItem: (itemId: string) => void;
  undoCheckOff: (itemId: string) => void;
  snoozeItem: (itemId: string, days: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  addItem: (productId: string, householdId: string) => Promise<void>;
  acceptSuggestion: (suggestion: SuggestionItem) => Promise<void>;
  flushOfflineQueue: () => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────
const DEBOUNCE_MS = 5_000; // 5-second undo window

// ── Store ────────────────────────────────────────────────────
export const useShoppingListStore = create<ShoppingListState>((set, get) => ({
  items: [],
  suggestions: [],
  isLoading: false,
  householdId: null,
  autoAddedProductIds: new Set(),
  offlineQueue: [],
  pendingPurchases: new Map(),

  // ── Fetch active list + auto-add rules ─────────────────────
  fetchList: async (householdId: string) => {
    set({ isLoading: true, householdId });

    // 1. Shopping list items (active + expired-snoozed)
    const { data: listData, error: listError } = await supabase
      .from('shopping_list')
      .select('*, product:products(*)')
      .eq('household_id', householdId)
      .in('status', ['active', 'snoozed'])
      .order('added_at', { ascending: false });

    if (listError) {
      console.error('[store] fetchList error:', listError.message);
      set({ isLoading: false });
      return;
    }

    // 2. Inventory rules where auto_add_status = 'auto_add'
    //    → so we can label items as "auto-added" in the UI.
    const { data: rulesData } = await supabase
      .from('household_inventory_rules')
      .select('product_id')
      .eq('household_id', householdId)
      .eq('auto_add_status', 'auto_add');

    const autoIds = new Set((rulesData ?? []).map((r) => r.product_id));

    // 3. Filter: keep active items + snoozed items whose window expired
    const allItems = (listData ?? []) as ShoppingItem[];
    const activeItems = allItems.filter((item) => {
      if (item.status === 'snoozed' && item.snooze_until) {
        return new Date(item.snooze_until) <= new Date();
      }
      return item.status === 'active';
    });

    set({
      items: activeItems,
      autoAddedProductIds: autoIds,
      isLoading: false,
    });

    // 4. Fire-and-forget: fetch suggestions in parallel
    get().fetchSuggestions(householdId);
  },

  // ── Fetch suggestions from household_inventory_rules ───────
  fetchSuggestions: async (householdId: string) => {
    const { data, error } = await supabase
      .from('household_inventory_rules')
      .select('*, product:products(*)')
      .eq('household_id', householdId)
      .eq('auto_add_status', 'suggest_only')
      .gte('confidence_score', 50)
      .order('confidence_score', { ascending: false });

    if (error || !data) {
      console.error('[store] fetchSuggestions error:', error?.message);
      return;
    }

    // Exclude products that are already on the active list
    const activeProductIds = new Set(get().items.map((i) => i.product_id));

    type RuleWithProduct = InventoryRuleRow & { product: ProductRow };

    const suggestions: SuggestionItem[] = (data as RuleWithProduct[])
      .filter((rule) => !activeProductIds.has(rule.product_id))
      .map((rule) => ({
        id: rule.id,
        productId: rule.product_id,
        product: rule.product,
        confidenceScore: rule.confidence_score,
      }));

    set({ suggestions });
  },

  // ── Subscribe to Supabase Realtime ─────────────────────────
  subscribeRealtime: (householdId: string) => {
    const channel = supabase
      .channel(`shopping_list:${householdId}`)
      .on<ShoppingListRow>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_list',
          filter: `household_id=eq.${householdId}`,
        },
        async (payload: RealtimePostgresChangesPayload<ShoppingListRow>) => {
          const state = get();

          if (payload.eventType === 'INSERT') {
            const { data } = await supabase
              .from('shopping_list')
              .select('*, product:products(*)')
              .eq('id', payload.new.id)
              .single();

            if (data && (data as ShoppingItem).status === 'active') {
              set({ items: [data as ShoppingItem, ...state.items] });
            }
          }

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new;

            if (updated.status === 'purchased' || updated.status === 'snoozed') {
              // Another household member checked off / snoozed → remove locally
              set({ items: state.items.filter((i) => i.id !== updated.id) });
            } else if (updated.status === 'active') {
              // Un-snooze or re-activation — fetch with product join
              const { data } = await supabase
                .from('shopping_list')
                .select('*, product:products(*)')
                .eq('id', updated.id)
                .single();

              if (data) {
                const item = data as ShoppingItem;
                if (!state.items.some((i) => i.id === item.id)) {
                  set({ items: [item, ...state.items] });
                }
              }
            }
          }

          if (payload.eventType === 'DELETE' && payload.old?.id) {
            set({ items: state.items.filter((i) => i.id !== payload.old.id) });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // ── Optimistic check-off with 5 s debounce ─────────────────
  checkOffItem: (itemId: string) => {
    const state = get();

    // Optimistic: mark as purchased immediately (UI strikes-through)
    set({
      items: state.items.map((i) =>
        i.id === itemId
          ? { ...i, status: 'purchased' as const, purchased_at: new Date().toISOString() }
          : i,
      ),
    });

    // After 5 s — commit to Supabase (unless user taps Undo)
    const timeoutId = setTimeout(async () => {
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('shopping_list')
        .update({ status: 'purchased', purchased_at: now })
        .eq('id', itemId);

      if (error) {
        console.error('[store] purchase sync failed, queuing offline:', error.message);
        const cur = get();
        set({ offlineQueue: [...cur.offlineQueue, { itemId, purchasedAt: now }] });
      }

      // Clean up pending map
      const pending = get().pendingPurchases;
      pending.delete(itemId);
      set({ pendingPurchases: new Map(pending) });
    }, DEBOUNCE_MS);

    const newPending = new Map(state.pendingPurchases);
    newPending.set(itemId, { itemId, timeoutId });
    set({ pendingPurchases: newPending });
  },

  // ── Undo a check-off (within 5 s window) ──────────────────
  undoCheckOff: (itemId: string) => {
    const state = get();
    const pending = state.pendingPurchases.get(itemId);

    if (pending) {
      clearTimeout(pending.timeoutId);
      const newPending = new Map(state.pendingPurchases);
      newPending.delete(itemId);

      set({
        items: state.items.map((i) =>
          i.id === itemId ? { ...i, status: 'active' as const, purchased_at: null } : i,
        ),
        pendingPurchases: newPending,
      });
    }
  },

  // ── Snooze an item ────────────────────────────────────────
  snoozeItem: async (itemId: string, days: number) => {
    const state = get();
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);

    // Optimistic remove from view
    set({ items: state.items.filter((i) => i.id !== itemId) });

    await supabase
      .from('shopping_list')
      .update({ status: 'snoozed', snooze_until: snoozeUntil.toISOString() })
      .eq('id', itemId);
  },

  // ── Remove / delete item (triggers AI confidence penalty) ──
  removeItem: async (itemId: string) => {
    const state = get();
    set({ items: state.items.filter((i) => i.id !== itemId) });

    await supabase.from('shopping_list').delete().eq('id', itemId);
  },

  // ── Add item manually ─────────────────────────────────────
  addItem: async (productId: string, householdId: string) => {
    const { data, error } = await supabase
      .from('shopping_list')
      .insert({
        household_id: householdId,
        product_id: productId,
        quantity: 1,
        status: 'active',
      })
      .select('*, product:products(*)')
      .single();

    if (error) {
      console.error('[store] addItem error:', error.message);
      return;
    }

    if (data) {
      const state = get();
      set({ items: [data as ShoppingItem, ...state.items] });
    }
  },

  // ── Accept a suggestion → insert into shopping_list ────────
  acceptSuggestion: async (suggestion: SuggestionItem) => {
    const state = get();
    const householdId = state.householdId;
    if (!householdId) return;

    // Optimistic: remove from suggestions
    set({ suggestions: state.suggestions.filter((s) => s.id !== suggestion.id) });

    // Delegate to addItem (handles insert + local state update)
    await get().addItem(suggestion.productId, householdId);
  },

  // ── Flush offline queue ─────────────────────────────────────
  flushOfflineQueue: async () => {
    const state = get();
    if (state.offlineQueue.length === 0) return;

    const queue = [...state.offlineQueue];
    set({ offlineQueue: [] });

    for (const action of queue) {
      const { error } = await supabase
        .from('shopping_list')
        .update({ status: 'purchased', purchased_at: action.purchasedAt })
        .eq('id', action.itemId);

      if (error) {
        const cur = get();
        set({ offlineQueue: [...cur.offlineQueue, action] });
      }
    }
  },
}));
