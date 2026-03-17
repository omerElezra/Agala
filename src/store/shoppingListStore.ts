import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { create } from "zustand";
import { supabase } from "../lib/supabase";
import type { Database } from "../types/database";

// ── Types ────────────────────────────────────────────────────
type ShoppingListRow = Database["public"]["Tables"]["shopping_list"]["Row"];
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type InventoryRuleRow =
  Database["public"]["Tables"]["household_inventory_rules"]["Row"];

/** An item currently on the shopping list (active, purchased, or snoozed). */
export interface ShoppingItem extends ShoppingListRow {
  product: ProductRow | null;
}

/** A recommendation for items due soon or overdue, shown in a horizontal line. */
export interface RecommendationItem {
  id: string; // household_inventory_rules.id
  productId: string;
  product: ProductRow;
  /** Days until next predicted purchase (negative = overdue). */
  daysLeft: number;
  /** "overdue" | "due-soon" (1-2 days) | "upcoming" (3 days) */
  urgency: "overdue" | "due-soon" | "upcoming";
}

/** Prediction urgency status for a product. */
export type PredictionStatus =
  | "overdue"
  | "due-soon"
  | "upcoming"
  | "normal"
  | "no-data";

interface OfflineAction {
  itemId: string;
  purchasedAt: string;
}

interface ShoppingListState {
  // ── Data ─────────────────────────────────────────────────
  items: ShoppingItem[];

  recommendations: RecommendationItem[];
  /** Full pool of recommendation candidates (sorted), sliced to show top N. */
  _allRecCandidates: RecommendationItem[];
  /** Set of product IDs the user has skipped this session. */
  _skippedRecIds: Set<string>;
  /** Per-product prediction urgency — used for R/Y/G dots on all-products */
  predictionStatusMap: Map<string, PredictionStatus>;
  /** Per-product depletion percentage (0-100) — how close to running out */
  depletionPercentMap: Map<string, number>;
  isLoading: boolean;
  householdId: string | null;

  /** Product IDs whose inventory rule is auto_add — used to split the UI
   *  into "Auto-Added" vs "Manually Added" sections. */
  autoAddedProductIds: Set<string>;

  // ── Offline / optimistic ─────────────────────────────────
  offlineQueue: OfflineAction[];

  // ── Actions ──────────────────────────────────────────────
  fetchList: (householdId: string) => Promise<void>;

  fetchRecommendations: (householdId: string) => Promise<void>;
  subscribeRealtime: (householdId: string) => () => void;
  checkOffItem: (itemId: string) => void;
  snoozeItem: (itemId: string, days: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  reactivateItem: (itemId: string) => void;
  addItem: (
    productId: string,
    householdId: string,
    quantity?: number,
    product?: ProductRow | null,
    toCart?: boolean,
  ) => "added" | "exists";
  updateQuantity: (itemId: string, newQuantity: number) => Promise<void>;
  /** Accept a recommendation — add to cart and instantly replace in the list. */
  acceptRecommendation: (rec: RecommendationItem) => void;
  /** Skip a recommendation — hide it and instantly replace in the list. */
  skipRecommendation: (rec: RecommendationItem) => void;
  flushOfflineQueue: () => Promise<void>;
}

// ── Store ────────────────────────────────────────────────────
export const useShoppingListStore = create<ShoppingListState>((set, get) => ({
  items: [],
  recommendations: [],
  _allRecCandidates: [],
  _skippedRecIds: new Set(),
  predictionStatusMap: new Map(),
  depletionPercentMap: new Map(),
  isLoading: false,
  householdId: null,
  autoAddedProductIds: new Set(),
  offlineQueue: [],

  // ── Fetch active list + auto-add rules ─────────────────────
  fetchList: async (householdId: string) => {
    set({ isLoading: true, householdId });

    // 1. Shopping list items (active + purchased + expired-snoozed)
    const { data: listData, error: listError } = await supabase
      .from("shopping_list")
      .select("*, product:products(*)")
      .eq("household_id", householdId)
      .in("status", ["active", "snoozed", "purchased"])
      .order("added_at", { ascending: false });

    if (listError) {
      console.error("[store] fetchList error:", listError.message);
      set({ isLoading: false });
      return;
    }

    console.log("[store] fetchList raw count:", listData?.length ?? 0);

    // 2. Inventory rules where auto_add_status = 'auto_add'
    //    → so we can label items as "auto-added" in the UI.
    const { data: rulesData } = await supabase
      .from("household_inventory_rules")
      .select("product_id")
      .eq("household_id", householdId)
      .eq("auto_add_status", "auto_add");

    console.log("[store] auto_add rules count:", rulesData?.length ?? 0);

    const autoIds = new Set((rulesData ?? []).map((r) => r.product_id));

    // 3. Filter: keep active + purchased + snoozed items whose window expired
    const allItems = (listData ?? []) as ShoppingItem[];
    const activeItems = allItems.filter((item) => {
      if (item.status === "snoozed" && item.snooze_until) {
        return new Date(item.snooze_until) <= new Date();
      }
      return item.status === "active" || item.status === "purchased";
    });

    set({
      items: activeItems,
      autoAddedProductIds: autoIds,
      isLoading: false,
    });

    console.log(
      "[store] fetchList done:",
      "total:",
      activeItems.length,
      "active:",
      activeItems.filter((i) => i.status === "active").length,
      "purchased:",
      activeItems.filter((i) => i.status === "purchased").length,
    );

    // 4. Fetch recommendations + prediction status + depletion map
    get().fetchRecommendations(householdId);
  },

  // ── Fetch recommendations + prediction status map ────────
  fetchRecommendations: async (householdId: string) => {
    // Fetch ALL rules with prediction data to build the status map
    const { data, error } = await supabase
      .from("household_inventory_rules")
      .select("*, product:products(*)")
      .eq("household_id", householdId)
      .gt("ema_days", 0)
      .not("last_purchased_at", "is", null);

    if (error || !data) {
      console.error("[store] fetchRecommendations error:", error?.message);
      return;
    }

    console.log(
      "[store] fetchRecommendations: rules with ema_days>0:",
      data.length,
    );

    // Only recommend products in the "All Items" section (purchased),
    // never items currently in the shopping cart.
    const purchasedProductIds = new Set(
      get()
        .items.filter((i) => i.status === "purchased")
        .map((i) => i.product_id),
    );
    type RuleWithProduct = InventoryRuleRow & { product: ProductRow };

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Build a lookup for last purchase quantity per product
    const itemsByProduct = new Map(get().items.map((i) => [i.product_id, i]));

    // Build prediction status for ALL products
    const statusMap = new Map<string, PredictionStatus>();
    const depletionMap = new Map<string, number>();
    const recCandidates: RecommendationItem[] = [];

    for (const rule of data as RuleWithProduct[]) {
      // ema_days is per-1-item; multiply by last qty for actual interval
      const lastQty = itemsByProduct.get(rule.product_id)?.quantity ?? 1;

      // Use the MOST RECENT purchase date: either the inventory rule's
      // last_purchased_at or the shopping list item's purchased_at
      const ruleDate = new Date(rule.last_purchased_at!).getTime();
      const shopItem = itemsByProduct.get(rule.product_id);
      const shopDate = shopItem?.purchased_at
        ? new Date(shopItem.purchased_at).getTime()
        : 0;
      const lastDate = Math.max(ruleDate, shopDate);

      const nextDate = lastDate + rule.ema_days * lastQty * DAY_MS;
      const daysLeft = Math.ceil((nextDate - now) / DAY_MS);

      let status: PredictionStatus;
      if (daysLeft <= 0) status = "overdue";
      else if (daysLeft <= 2) status = "due-soon";
      else if (daysLeft <= 5) status = "upcoming";
      else status = "normal";

      statusMap.set(rule.product_id, status);

      // Depletion %: how much of the purchase cycle has elapsed
      const totalCycleDays = rule.ema_days * lastQty;
      const daysElapsed = (now - lastDate) / DAY_MS;
      const depletion =
        totalCycleDays > 0
          ? Math.min(
              100,
              Math.max(0, Math.round((daysElapsed / totalCycleDays) * 100)),
            )
          : 0;
      depletionMap.set(rule.product_id, depletion);

      // Recommendation candidates: due within 3 days AND in "All Items" (purchased)
      if (daysLeft <= 3 && purchasedProductIds.has(rule.product_id)) {
        let urgency: RecommendationItem["urgency"];
        if (daysLeft <= 0) urgency = "overdue";
        else if (daysLeft <= 2) urgency = "due-soon";
        else urgency = "upcoming";

        recCandidates.push({
          id: rule.id,
          productId: rule.product_id,
          product: rule.product,
          daysLeft,
          urgency,
        });
      }
    }

    const skipped = get()._skippedRecIds;
    const sortedCandidates = recCandidates.sort(
      (a, b) => a.daysLeft - b.daysLeft,
    );
    const recs = sortedCandidates
      .filter((r) => !skipped.has(r.productId))
      .slice(0, 5);

    console.log(
      "[store] fetchRecommendations results:",
      "statusMap size:",
      statusMap.size,
      "rec candidates:",
      sortedCandidates.length,
      "recs shown:",
      recs.length,
      recs.map((r) => `${r.product.name}: ${r.daysLeft}d (${r.urgency})`),
    );

    set({
      recommendations: recs,
      _allRecCandidates: sortedCandidates,
      predictionStatusMap: statusMap,
      depletionPercentMap: depletionMap,
    });
  },

  // ── Subscribe to Supabase Realtime ─────────────────────────
  subscribeRealtime: (householdId: string) => {
    const channel = supabase
      .channel(`shopping_list:${householdId}`)
      .on<ShoppingListRow>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_list",
          filter: `household_id=eq.${householdId}`,
        },
        async (payload: RealtimePostgresChangesPayload<ShoppingListRow>) => {
          const state = get();

          if (payload.eventType === "INSERT") {
            // Skip if we already have this item by id OR by product_id
            if (
              state.items.some(
                (i) =>
                  i.id === payload.new.id ||
                  i.product_id === payload.new.product_id,
              )
            ) {
              return;
            }

            const { data } = await supabase
              .from("shopping_list")
              .select("*, product:products(*)")
              .eq("id", payload.new.id)
              .single();

            if (data && (data as ShoppingItem).status === "active") {
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

          if (payload.eventType === "UPDATE") {
            const updated = payload.new;

            if (updated.status === "snoozed") {
              // Another household member snoozed → remove locally
              set({ items: state.items.filter((i) => i.id !== updated.id) });
            } else if (updated.status === "purchased") {
              // Another household member checked off → update status locally
              set({
                items: state.items.map((i) =>
                  i.id === updated.id
                    ? {
                        ...i,
                        status: "purchased" as const,
                        purchased_at: updated.purchased_at,
                      }
                    : i,
                ),
              });
            } else if (updated.status === "active") {
              // Un-snooze or re-activation — fetch with product join
              const { data } = await supabase
                .from("shopping_list")
                .select("*, product:products(*)")
                .eq("id", updated.id)
                .single();

              if (data) {
                const item = data as ShoppingItem;
                if (!state.items.some((i) => i.id === item.id)) {
                  set({ items: [item, ...state.items] });
                }
              }
            }
          }

          if (payload.eventType === "DELETE" && payload.old?.id) {
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
          ? { ...i, status: "purchased" as const, purchased_at: now }
          : i,
      ),
    });

    // Optimistic: update prediction dot to "normal" (just bought → not due)
    // and remove from recommendations (it's no longer due)
    if (item) {
      const newStatusMap = new Map(state.predictionStatusMap);
      newStatusMap.set(item.product_id, "normal");

      const newCandidates = state._allRecCandidates.filter(
        (c) => c.productId !== item.product_id,
      );
      set({
        predictionStatusMap: newStatusMap,
        _allRecCandidates: newCandidates,
        recommendations: newCandidates
          .filter((c) => !state._skippedRecIds.has(c.productId))
          .slice(0, 5),
      });
    }

    // Commit to Supabase immediately (no delay)
    (async () => {
      // 1. Update shopping_list status
      const { error } = await supabase
        .from("shopping_list")
        .update({ status: "purchased", purchased_at: now })
        .eq("id", itemId);

      if (error) {
        console.error(
          "[store] purchase sync failed, queuing offline:",
          error.message,
        );
        const cur = get();
        set({
          offlineQueue: [...cur.offlineQueue, { itemId, purchasedAt: now }],
        });
      }

      // 2. Log transaction in purchase_history
      if (item) {
        const { error: histError } = await supabase
          .from("purchase_history")
          .insert({
            household_id: item.household_id,
            product_id: item.product_id,
            quantity: item.quantity,
            purchased_at: now,
          });
        if (histError) {
          console.error(
            "[store] purchase_history insert failed:",
            histError.message,
          );
        }

        // 3. Ensure an inventory rule exists for this product
        //    (creates on first purchase; updates last_purchased_at if exists)
        const { data: existingRule } = await supabase
          .from("household_inventory_rules")
          .select("id")
          .eq("household_id", item.household_id)
          .eq("product_id", item.product_id)
          .maybeSingle();

        if (existingRule) {
          // Update last_purchased_at so prediction status refreshes
          const { error: updateErr } = await supabase
            .from("household_inventory_rules")
            .update({ last_purchased_at: now })
            .eq("id", existingRule.id);
          if (updateErr) {
            console.error(
              "[store] inventory rule update failed:",
              updateErr.message,
            );
          }
        } else {
          const { error: ruleError } = await supabase
            .from("household_inventory_rules")
            .insert({
              household_id: item.household_id,
              product_id: item.product_id,
              last_purchased_at: now,
            });
          if (ruleError) {
            console.error(
              "[store] inventory rule insert failed:",
              ruleError.message,
            );
          }
        }
        // Note: we do NOT call fetchRecommendations here — the optimistic
        // updates above already set the dot to "normal" and removed the item
        // from recommendations. Re-fetching would overwrite with stale DB data.
      }
    })();
  },

  // ── Reactivate a purchased item (move back to cart) ────────
  reactivateItem: (itemId: string) => {
    const state = get();

    // Optimistic: set status back to active immediately
    const updatedItems = state.items.map((i) =>
      i.id === itemId
        ? { ...i, status: "active" as const, purchased_at: null }
        : i,
    );
    set({ items: updatedItems });

    // Refresh recommendations: the reactivated product is no longer "purchased"
    const purchasedProductIds = new Set(
      updatedItems
        .filter((i) => i.status === "purchased")
        .map((i) => i.product_id),
    );
    const skipped = get()._skippedRecIds;
    const remaining = state._allRecCandidates.filter(
      (c) => purchasedProductIds.has(c.productId) && !skipped.has(c.productId),
    );
    set({
      recommendations: remaining.slice(0, 5),
      _allRecCandidates: remaining,
    });

    // Sync with DB in background
    (async () => {
      const { error } = await supabase
        .from("shopping_list")
        .update({ status: "active", purchased_at: null })
        .eq("id", itemId);

      if (error) {
        console.error("[store] reactivateItem error:", error.message);
        // Revert on failure
        const current = get();
        set({
          items: current.items.map((i) =>
            i.id === itemId ? { ...i, status: "purchased" as const } : i,
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
      .from("shopping_list")
      .update({ status: "snoozed", snooze_until: snoozeUntil.toISOString() })
      .eq("id", itemId);
  },

  // ── Remove / delete item (triggers AI confidence penalty) ──
  removeItem: async (itemId: string) => {
    const state = get();
    set({ items: state.items.filter((i) => i.id !== itemId) });

    await supabase.from("shopping_list").delete().eq("id", itemId);
  },

  // ── Add item manually (skip if same product already active) ──
  addItem: (
    productId: string,
    householdId: string,
    quantity: number = 1,
    product: ProductRow | null = null,
    toCart: boolean = false,
  ): "added" | "exists" => {
    const status = toCart ? "active" : "purchased";

    // 1. Check local state — block if product already exists in any list
    const state = get();
    const existingItem = state.items.find((i) => i.product_id === productId);

    if (existingItem) {
      // Special case: adding to cart and item is in all-products → reactivate (move to cart)
      if (toCart && existingItem.status === "purchased") {
        get().reactivateItem(existingItem.id);
        return "added";
      }
      // Otherwise it already exists somewhere — no duplicates allowed
      return "exists";
    }

    // 4. Optimistic: add a placeholder item immediately (instant UI)
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    const optimisticItem: ShoppingItem = {
      id: tempId,
      household_id: householdId,
      product_id: productId,
      quantity,
      status,
      added_at: now,
      purchased_at: toCart ? null : now,
      snooze_until: null,
      product,
    };
    set({ items: [optimisticItem, ...state.items] });

    // 3. Background: check DB + insert (fire-and-forget)
    (async () => {
      try {
        // Check if another device already added it (any status)
        const { data: dbExisting } = await supabase
          .from("shopping_list")
          .select("id, status")
          .eq("household_id", householdId)
          .eq("product_id", productId)
          .in("status", ["active", "purchased"])
          .maybeSingle();

        if (dbExisting) {
          // Already exists in DB — replace temp item with real one
          const { data: full } = await supabase
            .from("shopping_list")
            .select("*, product:products(*)")
            .eq("id", dbExisting.id)
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
          .from("shopping_list")
          .insert({
            household_id: householdId,
            product_id: productId,
            quantity,
            status,
            ...(status === "purchased" ? { purchased_at: now } : {}),
          })
          .select("*, product:products(*)")
          .single();

        if (error) {
          console.error("[store] addItem error:", error.message);
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

          // When adding as "purchased" (All Products), also seed
          // purchase_history and a blank inventory rule so the
          // prediction engine can start learning from the first add.
          if (status === "purchased") {
            await supabase.from("purchase_history").insert({
              household_id: householdId,
              product_id: productId,
              quantity,
              purchased_at: now,
            });

            const { data: existingRule } = await supabase
              .from("household_inventory_rules")
              .select("id")
              .eq("household_id", householdId)
              .eq("product_id", productId)
              .maybeSingle();

            if (!existingRule) {
              await supabase.from("household_inventory_rules").insert({
                household_id: householdId,
                product_id: productId,
                last_purchased_at: now,
              });
            }
          }
        }
      } catch (err) {
        console.error("[store] addItem unexpected error:", err);
        const current = get();
        set({ items: current.items.filter((i) => i.id !== tempId) });
      }
    })();

    return "added";
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
      .from("shopping_list")
      .update({ quantity: newQuantity })
      .eq("id", itemId);

    if (error) {
      console.error("[store] updateQuantity error:", error.message);
      // Revert on failure
      const current = get();
      set({
        items: current.items.map((i) =>
          i.id === itemId
            ? {
                ...i,
                quantity:
                  state.items.find((o) => o.id === itemId)?.quantity ??
                  newQuantity,
              }
            : i,
        ),
      });
    }
  },

  // ── Accept recommendation → add to cart + replace instantly ──
  acceptRecommendation: (rec: RecommendationItem) => {
    const state = get();
    const householdId = state.householdId;
    if (!householdId) return;

    // Add to cart — this changes the item's status from 'purchased' to 'active'
    get().addItem(rec.productId, householdId, 1, rec.product, true);

    // Rebuild purchased set: only products still in "All Items" (not in cart)
    const purchasedProductIds = new Set(
      get()
        .items.filter((i) => i.status === "purchased")
        .map((i) => i.product_id),
    );
    const skipped = get()._skippedRecIds;
    const remaining = state._allRecCandidates.filter(
      (c) =>
        purchasedProductIds.has(c.productId) &&
        c.productId !== rec.productId &&
        !skipped.has(c.productId),
    );
    set({
      recommendations: remaining.slice(0, 5),
      _allRecCandidates: remaining,
    });
  },

  // ── Skip recommendation → hide + replace instantly ───────────
  skipRecommendation: (rec: RecommendationItem) => {
    const state = get();
    const skipped = new Set(state._skippedRecIds);
    skipped.add(rec.productId);

    const purchasedProductIds = new Set(
      get()
        .items.filter((i) => i.status === "purchased")
        .map((i) => i.product_id),
    );
    const remaining = state._allRecCandidates.filter(
      (c) => purchasedProductIds.has(c.productId) && !skipped.has(c.productId),
    );
    set({
      _skippedRecIds: skipped,
      recommendations: remaining.slice(0, 5),
      _allRecCandidates: remaining,
    });
  },

  // ── Flush offline queue ─────────────────────────────────────
  flushOfflineQueue: async () => {
    const state = get();
    if (state.offlineQueue.length === 0) return;

    const queue = [...state.offlineQueue];
    set({ offlineQueue: [] });

    for (const action of queue) {
      const { error } = await supabase
        .from("shopping_list")
        .update({ status: "purchased", purchased_at: action.purchasedAt })
        .eq("id", action.itemId);

      if (error) {
        const cur = get();
        set({ offlineQueue: [...cur.offlineQueue, action] });
      }
    }
  },
}));
