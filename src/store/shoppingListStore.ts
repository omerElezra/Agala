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

  // ── Actions ──────────────────────────────────────────────
  fetchList: (householdId: string) => Promise<void>;
  fetchSuggestions: (householdId: string) => Promise<void>;
  subscribeRealtime: (householdId: string) => () => void;
  checkOffItem: (itemId: string) => void;
  snoozeItem: (itemId: string, days: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  reactivateItem: (itemId: string) => void;
  addItem: (productId: string, householdId: string, quantity?: number, product?: ProductRow | null) => 'added' | 'exists';
  updateQuantity: (itemId: string, newQuantity: number) => Promise<void>;
  acceptSuggestion: (suggestion: SuggestionItem) => Promise<void>;
  flushOfflineQueue: () => Promise<void>;
}

// ── Store ────────────────────────────────────────────────────
export const useShoppingListStore = create<ShoppingListState>((set, get) => ({
  items: [],
  suggestions: [],
  isLoading: false,
  householdId: null,
  autoAddedProductIds: new Set(),
  offlineQueue: [],

  // ── Fetch active list + auto-add rules ─────────────────────
  fetchList: async (householdId: string) => {
    set({ isLoading: true, householdId });

    // 1. Shopping list items (active + purchased + expired-snoozed)
    const { data: listData, error: listError } = await supabase
      .from('shopping_list')
      .select('*, product:products(*)')
      .eq('household_id', householdId)
      .in('status', ['active', 'snoozed', 'purchased'])
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

    // 3. Filter: keep active + purchased + snoozed items whose window expired
    const allItems = (listData ?? []) as ShoppingItem[];
    const activeItems = allItems.filter((item) => {
      if (item.status === 'snoozed' && item.snooze_until) {
        return new Date(item.snooze_until) <= new Date();
      }
      return item.status === 'active' || item.status === 'purchased';
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
            // Skip if we already have this item by id OR by product_id
            if (
              state.items.some(
                (i) => i.id === payload.new.id || i.product_id === payload.new.product_id,
              )
            ) {
              return;
            }

            const { data } = await supabase
              .from('shopping_list')
              .select('*, product:products(*)')
              .eq('id', payload.new.id)
              .single();

            if (data && (data as ShoppingItem).status === 'active') {
              // Re-check after async fetch in case state changed
              const current = get();
              if (
                !current.items.some(
                  (i) =>
                    i.id === (data as ShoppingItem).id ||
                    i.product_id === (data as ShoppingItem).product_id,
                )
              ) {
                set({ items: [data as ShoppingItem, ...current.items] });
              }
            }
          }

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new;

            if (updated.status === 'snoozed') {
              // Another household member snoozed → remove locally
              set({ items: state.items.filter((i) => i.id !== updated.id) });
            } else if (updated.status === 'purchased') {
              // Another household member checked off → update status locally
              set({
                items: state.items.map((i) =>
                  i.id === updated.id
                    ? { ...i, status: 'purchased' as const, purchased_at: updated.purchased_at }
                    : i,
                ),
              });
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

  // ── Immediate check-off (purchase) ─────────────────────────
  checkOffItem: (itemId: string) => {
    const state = get();
    const item = state.items.find((i) => i.id === itemId);
    const now = new Date().toISOString();

    // Optimistic: mark as purchased immediately
    set({
      items: state.items.map((i) =>
        i.id === itemId
          ? { ...i, status: 'purchased' as const, purchased_at: now }
          : i,
      ),
    });

    // Commit to Supabase immediately (no delay)
    (async () => {
      // 1. Update shopping_list status
      const { error } = await supabase
        .from('shopping_list')
        .update({ status: 'purchased', purchased_at: now })
        .eq('id', itemId);

      if (error) {
        console.error('[store] purchase sync failed, queuing offline:', error.message);
        const cur = get();
        set({ offlineQueue: [...cur.offlineQueue, { itemId, purchasedAt: now }] });
      }

      // 2. Log transaction in purchase_history
      if (item) {
        const { error: histError } = await supabase
          .from('purchase_history')
          .insert({
            household_id: item.household_id,
            product_id: item.product_id,
            quantity: item.quantity,
            purchased_at: now,
          });
        if (histError) {
          console.error('[store] purchase_history insert failed:', histError.message);
        }
      }
    })();
  },

  // ── Reactivate a purchased item (move back to cart) ────────
  reactivateItem: (itemId: string) => {
    const state = get();

    // Optimistic: set status back to active immediately
    set({
      items: state.items.map((i) =>
        i.id === itemId
          ? { ...i, status: 'active' as const, purchased_at: null }
          : i,
      ),
    });

    // Sync with DB in background
    (async () => {
      const { error } = await supabase
        .from('shopping_list')
        .update({ status: 'active', purchased_at: null })
        .eq('id', itemId);

      if (error) {
        console.error('[store] reactivateItem error:', error.message);
        // Revert on failure
        const current = get();
        set({
          items: current.items.map((i) =>
            i.id === itemId
              ? { ...i, status: 'purchased' as const }
              : i,
          ),
        });
      }
    })();
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

  // ── Add item manually (skip if same product already active) ──
  addItem: (productId: string, householdId: string, quantity: number = 1, product: ProductRow | null = null): 'added' | 'exists' => {
    // 1. Check local state — if already active, return 'exists'
    const state = get();
    if (state.items.some((i) => i.product_id === productId && i.status === 'active')) {
      return 'exists';
    }

    // 2. If the product exists as purchased, reactivate it instead of creating duplicate
    const purchasedItem = state.items.find((i) => i.product_id === productId && i.status === 'purchased');
    if (purchasedItem) {
      get().reactivateItem(purchasedItem.id);
      return 'added';
    }

    // 2. Optimistic: add a placeholder item immediately (instant UI)
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    const optimisticItem: ShoppingItem = {
      id: tempId,
      household_id: householdId,
      product_id: productId,
      quantity,
      status: 'active',
      added_at: now,
      purchased_at: null,
      snooze_until: null,
      product,
    };
    set({ items: [optimisticItem, ...state.items] });

    // 3. Background: check DB + insert (fire-and-forget)
    (async () => {
      try {
        // Check if another device already added it
        const { data: dbExisting } = await supabase
          .from('shopping_list')
          .select('id')
          .eq('household_id', householdId)
          .eq('product_id', productId)
          .eq('status', 'active')
          .maybeSingle();

        if (dbExisting) {
          // Already exists in DB — replace temp item with real one
          const { data: full } = await supabase
            .from('shopping_list')
            .select('*, product:products(*)')
            .eq('id', dbExisting.id)
            .single();

          const current = get();
          set({
            items: current.items
              .filter((i) => i.id !== tempId)
              .filter((i) => i.id !== dbExisting.id)
              .concat(full ? [full as ShoppingItem] : []),
          });
          return;
        }

        // Insert new row
        const { data, error } = await supabase
          .from('shopping_list')
          .insert({
            household_id: householdId,
            product_id: productId,
            quantity,
            status: 'active',
          })
          .select('*, product:products(*)')
          .single();

        if (error) {
          console.error('[store] addItem error:', error.message);
          // Remove optimistic item on failure
          const current = get();
          set({ items: current.items.filter((i) => i.id !== tempId) });
          return;
        }

        // Replace temp item with real DB item
        if (data) {
          const current = get();
          set({
            items: current.items.map((i) =>
              i.id === tempId ? (data as ShoppingItem) : i,
            ),
          });
        }
      } catch (err) {
        console.error('[store] addItem unexpected error:', err);
        const current = get();
        set({ items: current.items.filter((i) => i.id !== tempId) });
      }
    })();

    return 'added';
  },

  // ── Update quantity on an existing item ─────────────────────
  updateQuantity: async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;

    // Optimistic local update
    const state = get();
    set({
      items: state.items.map((i) =>
        i.id === itemId ? { ...i, quantity: newQuantity } : i,
      ),
    });

    const { error } = await supabase
      .from('shopping_list')
      .update({ quantity: newQuantity })
      .eq('id', itemId);

    if (error) {
      console.error('[store] updateQuantity error:', error.message);
      // Revert on failure
      const current = get();
      set({
        items: current.items.map((i) =>
          i.id === itemId ? { ...i, quantity: state.items.find((o) => o.id === itemId)?.quantity ?? newQuantity } : i,
        ),
      });
    }
  },

  // ── Accept a suggestion → insert into shopping_list ────────
  acceptSuggestion: async (suggestion: SuggestionItem) => {
    const state = get();
    const householdId = state.householdId;
    if (!householdId) return;

    // Optimistic: remove from suggestions
    set({ suggestions: state.suggestions.filter((s) => s.id !== suggestion.id) });

    // Delegate to addItem (now synchronous + optimistic)
    get().addItem(suggestion.productId, householdId, 1, suggestion.product);
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
