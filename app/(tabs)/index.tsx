import { dark } from "@/constants/theme";
import { CategorySheet } from "@/src/components/CategorySheet";
import { ShoppingListItem } from "@/src/components/ShoppingListItem";
import { SnoozeSheet } from "@/src/components/SnoozeSheet";
import { SuggestionChips } from "@/src/components/SuggestionChips";
import { useAuth } from "@/src/hooks/useAuth";
import { supabase } from "@/src/lib/supabase";
import {
  useShoppingListStore,
  type ShoppingItem,
  type SuggestionItem,
} from "@/src/store/shoppingListStore";
import { CATEGORY_EMOJIS, detectCategory } from "@/src/utils/categoryDetector";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type CartSortMode = "name" | "category" | "recent";
type AllProductsSortMode = "name" | "category" | "recent";

const CART_SORT_OPTIONS: { key: CartSortMode; label: string }[] = [
  { key: "recent", label: "שונה לאחרונה" },
  { key: "name", label: "שם" },
  { key: "category", label: "קטגוריה" },
];

const ALL_SORT_OPTIONS: { key: AllProductsSortMode; label: string }[] = [
  { key: "recent", label: "שונה לאחרונה" },
  { key: "name", label: "שם" },
  { key: "category", label: "קטגוריה" },
];

type ListRow =
  | ShoppingItem
  | { type: "header"; title: string; emoji: string; key: string }
  | { type: "cart-category"; title: string; emoji: string; key: string }
  | { type: "divider"; key: string }
  | { type: "all-products-header"; key: string }
  | { type: "all-product-category"; title: string; emoji: string; key: string }
  | { type: "all-product-item"; item: ShoppingItem; key: string };

export default function HomeScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const {
    items,
    suggestions,
    isLoading,
    autoAddedProductIds,
    fetchList,
    subscribeRealtime,
    checkOffItem,
    snoozeItem,
    removeItem,
    acceptSuggestion,
    flushOfflineQueue,
  } = useShoppingListStore();

  const addItem = useShoppingListStore((s) => s.addItem);

  const [snoozeTarget, setSnoozeTarget] = useState<ShoppingItem | null>(null);
  const [categoryTarget, setCategoryTarget] = useState<ShoppingItem | null>(
    null,
  );
  // When adding a new product and detectCategory returns null, stash the name
  // so the CategorySheet can ask the user to pick a category before creating.
  const [pendingAddName, setPendingAddName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllProducts, setShowAllProducts] = useState(true);
  const [isAddingFromSearch, setIsAddingFromSearch] = useState(false);
  const [cartSort, setCartSort] = useState<CartSortMode>("recent");
  const [allProductsSort, setAllProductsSort] =
    useState<AllProductsSortMode>("recent");

  // ── Add item directly from search (no-match case) ──────────
  const handleAddFromSearch = useCallback(async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed || !user?.household_id || isAddingFromSearch) return;

    setIsAddingFromSearch(true);
    try {
      // Check if already exists in any list (cart or all products)
      const duplicate = items.find(
        (i) => i.product?.name?.toLowerCase() === trimmed.toLowerCase(),
      );
      if (duplicate) {
        setIsAddingFromSearch(false);
        return;
      }

      // Reuse existing product or create new
      const { data: existingProduct } = await supabase
        .from("products")
        .select("*")
        .ilike("name", trimmed)
        .limit(1)
        .maybeSingle();

      let productToAdd = existingProduct;

      if (!productToAdd) {
        let category: string | null = detectCategory(trimmed);

        if (!category) {
          const firstWord = trimmed.split(/\s+/)[0];
          if (firstWord && firstWord.length >= 2) {
            const { data: similar } = await supabase
              .from("products")
              .select("category")
              .ilike("name", `%${firstWord}%`)
              .not("category", "is", null)
              .limit(1)
              .maybeSingle();
            if (similar?.category) category = similar.category;
          }
        }

        // If still no category, ask the user to pick one via CategorySheet
        if (!category) {
          setPendingAddName(trimmed);
          setSearchQuery("");
          setIsAddingFromSearch(false);
          return;
        }

        const { data: newProduct, error } = await supabase
          .from("products")
          .insert({
            name: trimmed,
            is_custom: true,
            created_by_household: user.household_id,
            category,
          })
          .select()
          .single();

        if (error || !newProduct) {
          console.error("[HomeScreen] create product error:", error?.message);
          setIsAddingFromSearch(false);
          return;
        }
        productToAdd = newProduct;
      }

      addItem(productToAdd.id, user.household_id, 1, productToAdd, false);
      setSearchQuery("");
    } catch (err) {
      console.error("[HomeScreen] addFromSearch error:", err);
    } finally {
      setIsAddingFromSearch(false);
    }
  }, [searchQuery, user?.household_id, items, addItem, isAddingFromSearch]);

  // ── Bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    if (!user?.household_id) return;

    fetchList(user.household_id);
    const unsub = subscribeRealtime(user.household_id);
    flushOfflineQueue();

    return unsub;
  }, [user?.household_id, fetchList, subscribeRealtime, flushOfflineQueue]);

  // Reset sort state when screen is focused
  useFocusEffect(
    useCallback(() => {
      setCartSort("recent");
      setAllProductsSort("recent");
    }, []),
  );

  // ── Pull-to-refresh ────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    if (!user?.household_id) return;
    setRefreshing(true);
    await fetchList(user.household_id);
    setRefreshing(false);
  }, [user?.household_id, fetchList]);

  // ── Split items into active cart vs purchased/all ──────────
  const { activeItems, purchasedItems } = useMemo(() => {
    const active: ShoppingItem[] = [];
    const purchased: ShoppingItem[] = [];

    for (const item of items) {
      if (item.status === "purchased") {
        purchased.push(item);
      } else {
        active.push(item);
      }
    }

    return { activeItems: active, purchasedItems: purchased };
  }, [items]);

  // ── Filter by search query ─────────────────────────────────
  const filteredActive = useMemo(() => {
    if (!searchQuery.trim()) return activeItems;
    const q = searchQuery.trim().toLowerCase();
    return activeItems.filter(
      (i) =>
        (i.product?.name ?? "").toLowerCase().includes(q) ||
        (i.product?.category ?? "").toLowerCase().includes(q),
    );
  }, [activeItems, searchQuery]);

  const filteredPurchased = useMemo(() => {
    if (!searchQuery.trim()) return purchasedItems;
    const q = searchQuery.trim().toLowerCase();
    return purchasedItems.filter(
      (i) =>
        (i.product?.name ?? "").toLowerCase().includes(q) ||
        (i.product?.category ?? "").toLowerCase().includes(q),
    );
  }, [purchasedItems, searchQuery]);

  // ── Handlers ───────────────────────────────────────────────
  const handleSwipe = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      if (item) setSnoozeTarget(item);
    },
    [items],
  );

  const handleSnooze = useCallback(
    async (days: number) => {
      if (snoozeTarget) {
        await snoozeItem(snoozeTarget.id, days);
        setSnoozeTarget(null);
      }
    },
    [snoozeTarget, snoozeItem],
  );

  const handleRemove = useCallback(async () => {
    if (snoozeTarget) {
      await removeItem(snoozeTarget.id);
      setSnoozeTarget(null);
    }
  }, [snoozeTarget, removeItem]);

  // ── Quick category change (clone-on-edit for global products) ──
  // Also handles the "pending add" flow when a new product has no auto-category.
  const handleCategoryChange = useCallback(
    async (newCategory: string) => {
      if (!user?.household_id) return;

      // ── Flow A: user is picking a category for a brand-new product ──
      if (pendingAddName) {
        const name = pendingAddName;
        setPendingAddName(null);

        const { data: newProduct, error } = await supabase
          .from("products")
          .insert({
            name,
            category: newCategory,
            is_custom: true,
            created_by_household: user.household_id,
          })
          .select()
          .single();

        if (error || !newProduct) {
          console.error("[index] create product error:", error?.message);
          return;
        }

        addItem(newProduct.id, user.household_id, 1, newProduct, false);
        return;
      }

      // ── Flow B: user is editing an existing product's category ──
      if (!categoryTarget?.product) return;
      const product = categoryTarget.product;
      if (newCategory === product.category) {
        setCategoryTarget(null);
        return;
      }

      const isOwnProduct =
        product.is_custom && product.created_by_household === user.household_id;

      if (isOwnProduct) {
        // Direct update on own custom product
        const { error } = await supabase
          .from("products")
          .update({ category: newCategory })
          .eq("id", product.id);

        if (error) {
          console.error("[index] category update error:", error.message);
        }
      } else {
        // Global / foreign product → clone as custom, re-link ALL household items
        const { data: newProduct, error: createErr } = await supabase
          .from("products")
          .insert({
            name: product.name,
            category: newCategory,
            is_custom: true,
            created_by_household: user.household_id,
          })
          .select()
          .single();

        if (createErr || !newProduct) {
          console.error(
            "[index] create custom product error:",
            createErr?.message,
          );
          setCategoryTarget(null);
          return;
        }

        // Re-link all shopping list items for this product in this household
        const { error: relinkErr } = await supabase
          .from("shopping_list")
          .update({ product_id: newProduct.id })
          .eq("household_id", user.household_id)
          .eq("product_id", product.id);

        if (relinkErr) {
          console.error("[index] relink error:", relinkErr.message);
        }
      }

      // Refresh list to reflect changes
      await fetchList(user.household_id);
      setCategoryTarget(null);
    },
    [categoryTarget, pendingAddName, user?.household_id, fetchList, addItem],
  );

  const handleAcceptSuggestion = useCallback(
    (suggestion: SuggestionItem) => {
      acceptSuggestion(suggestion);
    },
    [acceptSuggestion],
  );

  // ── Active items in cart lookup (for "בעגלה" badge) ────────
  const activeProductIds = useMemo(() => {
    const set = new Set<string>();
    for (const item of activeItems) {
      set.add(item.product_id);
    }
    return set;
  }, [activeItems]);

  // ── Build flat list data ───────────────────────────────────
  const listData = useMemo<ListRow[]>(() => {
    const data: ListRow[] = [];

    // Section 1: Cart items ("עגלה שלי")
    if (filteredActive.length > 0) {
      data.push({
        type: "header",
        title: `עגלה שלי`,
        emoji: "",
        key: "h-cart",
      });
      // Sort cart items based on selected mode
      if (cartSort === "category") {
        // Group by category with headers
        const byCategory = new Map<string, ShoppingItem[]>();
        for (const item of filteredActive) {
          const cat = item.product?.category || "ללא קטגוריה";
          if (!byCategory.has(cat)) byCategory.set(cat, []);
          byCategory.get(cat)!.push(item);
        }
        const sortedCats = [...byCategory.keys()].sort((a, b) =>
          a.localeCompare(b, "he"),
        );
        for (const cat of sortedCats) {
          const emoji = CATEGORY_EMOJIS[cat] ?? "📦";
          data.push({
            type: "cart-category",
            title: cat,
            emoji,
            key: `cart-cat-${cat}`,
          });
          const catItems = byCategory.get(cat)!;
          catItems.sort((a, b) =>
            (a.product?.name ?? "").localeCompare(b.product?.name ?? "", "he"),
          );
          data.push(...catItems);
        }
      } else if (cartSort === "recent") {
        // Sort by most recently added
        const sorted = [...filteredActive].sort(
          (a, b) =>
            new Date(b.added_at).getTime() - new Date(a.added_at).getTime(),
        );
        data.push(...sorted);
      } else {
        // Sort by name (default)
        const sorted = [...filteredActive].sort((a, b) =>
          (a.product?.name ?? "").localeCompare(b.product?.name ?? "", "he"),
        );
        data.push(...sorted);
      }
    }

    // Divider
    if (filteredActive.length > 0 && filteredPurchased.length > 0) {
      data.push({ type: "divider", key: "divider-1" });
    }

    // Section 2: All products ("כל המוצרים")
    if (filteredPurchased.length > 0) {
      data.push({ type: "all-products-header", key: "h-all" });

      if (showAllProducts) {
        if (allProductsSort === "category") {
          // Group by category
          const byCategory = new Map<string, ShoppingItem[]>();
          for (const item of filteredPurchased) {
            const cat = item.product?.category || "ללא קטגוריה";
            if (!byCategory.has(cat)) byCategory.set(cat, []);
            byCategory.get(cat)!.push(item);
          }

          const sortedCats = [...byCategory.keys()].sort((a, b) =>
            a.localeCompare(b, "he"),
          );

          for (const cat of sortedCats) {
            const emoji = CATEGORY_EMOJIS[cat] ?? "📦";
            data.push({
              type: "all-product-category",
              title: cat,
              emoji,
              key: `cat-${cat}`,
            });
            const catItems = byCategory.get(cat)!;
            catItems.sort((a, b) =>
              (a.product?.name ?? "").localeCompare(
                b.product?.name ?? "",
                "he",
              ),
            );
            for (const item of catItems) {
              data.push({
                type: "all-product-item",
                item,
                key: `ap-${item.id}`,
              });
            }
          }
        } else {
          // Flat sort by name or recent — no category headers
          const sorted = [...filteredPurchased].sort((a, b) => {
            if (allProductsSort === "recent") {
              return (
                new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
              );
            }
            return (a.product?.name ?? "").localeCompare(
              b.product?.name ?? "",
              "he",
            );
          });
          for (const item of sorted) {
            data.push({
              type: "all-product-item",
              item,
              key: `ap-${item.id}`,
            });
          }
        }
      }
    }

    return data;
  }, [
    filteredActive,
    filteredPurchased,
    showAllProducts,
    cartSort,
    allProductsSort,
  ]);

  // ── Render helpers ─────────────────────────────────────────
  const renderRow = useCallback(
    ({ item: row }: { item: ListRow }) => {
      // Cart section header
      if ("type" in row && row.type === "header") {
        return (
          <View>
            <View style={styles.cartHeader}>
              <Text style={styles.cartTitle}>{row.title}</Text>
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>
                  {filteredActive.length} פריטים
                </Text>
              </View>
            </View>
            <View style={styles.sortRow}>
              <Ionicons
                name="swap-vertical"
                size={14}
                color={dark.textMuted}
                style={{ marginEnd: 6 }}
              />
              {CART_SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.sortChip,
                    cartSort === opt.key && styles.sortChipActive,
                  ]}
                  onPress={() => setCartSort(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortChipText,
                      cartSort === opt.key && styles.sortChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      }

      // Gradient divider
      if ("type" in row && row.type === "divider") {
        return <View style={styles.divider} />;
      }

      // Cart category header (when cart sorted by category)
      if ("type" in row && row.type === "cart-category") {
        return (
          <View style={styles.categoryHeader}>
            <Text style={styles.categoryEmoji}>{row.emoji}</Text>
            <Text style={styles.categoryTitle}>{row.title}</Text>
          </View>
        );
      }

      // "כל המוצרים" header (tappable to collapse)
      if ("type" in row && row.type === "all-products-header") {
        return (
          <View>
            <TouchableOpacity
              style={styles.allProductsHeader}
              onPress={() => setShowAllProducts((v) => !v)}
              activeOpacity={0.7}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Text style={styles.allProductsTitle}>כל המוצרים</Text>
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>
                    {filteredPurchased.length} פריטים
                  </Text>
                </View>
              </View>
              <Text style={styles.toggleArrow}>
                {showAllProducts ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>
            {showAllProducts && (
              <View style={styles.sortRow}>
                <Ionicons
                  name="swap-vertical"
                  size={14}
                  color={dark.textMuted}
                  style={{ marginEnd: 6 }}
                />
                {ALL_SORT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.sortChip,
                      allProductsSort === opt.key && styles.sortChipActive,
                    ]}
                    onPress={() => setAllProductsSort(opt.key)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.sortChipText,
                        allProductsSort === opt.key &&
                          styles.sortChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      }

      // Category header in "All Products"
      if ("type" in row && row.type === "all-product-category") {
        return (
          <View style={styles.categoryHeader}>
            <Text style={styles.categoryEmoji}>{row.emoji}</Text>
            <Text style={styles.categoryTitle}>{row.title}</Text>
          </View>
        );
      }

      // Product item in "All Products" section
      if ("type" in row && row.type === "all-product-item") {
        const isInCart = activeProductIds.has(row.item.product_id);
        return (
          <View style={styles.allProductCard}>
            <TouchableOpacity
              style={styles.allProductInfo}
              onPress={() => router.push(`/item/${row.item.id}`)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.allProductName,
                  isInCart && styles.allProductNameInCart,
                ]}
              >
                {row.item.product?.name ?? ""}
              </Text>
              <Text style={styles.allProductSub}>
                {row.item.product?.category ?? ""}
              </Text>
            </TouchableOpacity>
            {isInCart ? (
              <View style={styles.inCartBadge}>
                <Text style={styles.inCartBadgeText}>✓ בעגלה</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => {
                  if (user?.household_id) {
                    const store = useShoppingListStore.getState();
                    store.reactivateItem(row.item.id);
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="cart-outline" size={18} color={dark.accent} />
              </TouchableOpacity>
            )}
          </View>
        );
      }

      // Active cart item (ShoppingListItem card)
      return (
        <ShoppingListItem
          item={row as ShoppingItem}
          onCheckOff={checkOffItem}
          onSwipe={handleSwipe}
          highlighted={false}
        />
      );
    },
    [
      filteredActive.length,
      filteredPurchased.length,
      showAllProducts,
      activeProductIds,
      checkOffItem,
      handleSwipe,
      router,
      user?.household_id,
      cartSort,
      allProductsSort,
    ],
  );

  // ── Guards ─────────────────────────────────────────────────
  if (authLoading || isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={dark.accent} />
      </View>
    );
  }

  if (!user) {
    return null;
  }

  if (!user.household_id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>⚠️</Text>
        <Text style={styles.emptyText}>חסר מזהה משק בית</Text>
        <Text style={styles.emptySubtext}>
          נסו להתנתק ולהירשם מחדש, או פנו לתמיכה
        </Text>
      </View>
    );
  }

  // ── Main UI (matches main.html design) ─────────────────────
  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      {/* ── Sticky header area ── */}
      <View style={styles.headerArea}>
        {/* Title row */}
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>רשימת הקניות</Text>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="חפש מוצר להוספה..."
              placeholderTextColor={dark.placeholder}
              selectionColor={dark.accent}
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setSearchQuery("")}
                activeOpacity={0.6}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={dark.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Suggestion chips */}
      <SuggestionChips
        suggestions={suggestions}
        onAccept={handleAcceptSuggestion}
      />

      {/* Main scrollable content */}
      <FlatList
        data={listData}
        keyExtractor={(row) => {
          if ("type" in row) return row.key;
          return row.id;
        }}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={renderRow}
        ListEmptyComponent={
          searchQuery.trim().length > 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="search-outline"
                size={48}
                color={dark.textMuted}
              />
              <Text style={styles.emptyText}>לא נמצאו תוצאות</Text>
              <Text style={styles.emptySubtext}>
                &quot;{searchQuery.trim()}&quot; לא נמצא ברשימה
              </Text>
              <TouchableOpacity
                style={[
                  styles.addFromSearchBtn,
                  isAddingFromSearch && { opacity: 0.6 },
                ]}
                onPress={handleAddFromSearch}
                activeOpacity={0.7}
                disabled={isAddingFromSearch}
              >
                {isAddingFromSearch ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                )}
                <Text style={styles.addFromSearchText}>
                  {isAddingFromSearch
                    ? "מוסיף..."
                    : `הוסף "${searchQuery.trim()}" לרשימה`}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🛒</Text>
              <Text style={styles.emptyText}>הרשימה ריקה!</Text>
              <Text style={styles.emptySubtext}>
                חפשו מוצר בשורת החיפוש למעלה
              </Text>
            </View>
          )
        }
      />

      {/* Snooze bottom sheet */}
      <SnoozeSheet
        visible={!!snoozeTarget}
        productName={snoozeTarget?.product?.name ?? ""}
        onSnooze={handleSnooze}
        onRemove={handleRemove}
        onClose={() => setSnoozeTarget(null)}
      />

      {/* Quick category edit / pick-for-new-product bottom sheet */}
      <CategorySheet
        visible={!!categoryTarget || !!pendingAddName}
        productName={pendingAddName ?? categoryTarget?.product?.name ?? ""}
        currentCategory={
          pendingAddName ? null : (categoryTarget?.product?.category ?? null)
        }
        onSelect={handleCategoryChange}
        onClose={() => {
          setCategoryTarget(null);
          setPendingAddName(null);
        }}
      />
    </SafeAreaView>
  );
}

// ── Styles (Dark mode, matches main.html reference) ──────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: dark.background,
  },

  // ── Header area ────────────────────────────────────────────
  headerArea: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: dark.background,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: dark.text,
    letterSpacing: 0.5,
  },

  // ── Search bar ─────────────────────────────────────────────
  searchWrapper: {
    marginBottom: 4,
  },
  searchBar: {
    height: 44,
    borderRadius: 12,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.surfaceHighlight,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  searchIcon: {
    fontSize: 16,
    marginEnd: 8,
  },
  clearBtn: {
    paddingStart: 8,
    justifyContent: "center",
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: dark.inputText,
    writingDirection: "rtl",
  },

  // ── Cart section header ────────────────────────────────────
  cartHeader: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  cartTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: dark.text,
  },
  cartBadge: {
    backgroundColor: dark.surface,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  cartBadgeText: {
    fontSize: 12,
    color: dark.accent,
    fontWeight: "500",
  },

  // ── Gradient divider ───────────────────────────────────────
  divider: {
    height: 1,
    marginHorizontal: 20,
    marginVertical: 16,
    backgroundColor: dark.surfaceHighlight,
    opacity: 0.6,
  },

  // ── "All Products" section ─────────────────────────────────
  allProductsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  allProductsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: dark.textSecondary,
  },
  toggleArrow: {
    fontSize: 12,
    color: dark.textMuted,
  },

  // ── Category header ────────────────────────────────────────
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 8,
  },
  categoryEmoji: {
    fontSize: 14,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: dark.textSecondary,
  },

  // ── All-product card (dark surface, rounded) ───────────────
  allProductCard: {
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: dark.surfaceDark,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: dark.cardRadiusSm,
    marginHorizontal: 20,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: dark.surfaceHighlight,
  },
  allProductInfo: {
    flex: 1,
    direction: "rtl",
    writingDirection: "rtl",
    paddingEnd: 5,
  },
  allProductName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#D1D5DB", // gray-300
  },
  allProductNameInCart: {
    textDecorationLine: "line-through",
  },
  allProductSub: {
    fontSize: 10,
    color: dark.textSecondary,
    marginTop: 2,
  },
  categoryEditRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(139,159,232,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginStart: 5,
  },
  inCartBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: dark.success + "1A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginStart: 5,
  },
  inCartBadgeText: {
    fontSize: 12,
    color: dark.success,
    fontWeight: "600",
  },

  // ── List content ───────────────────────────────────────────
  listContent: {
    paddingBottom: 120,
  },

  // ── Empty state ────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700",
    color: dark.text,
  },
  emptySubtext: {
    fontSize: 14,
    color: dark.textSecondary,
    marginTop: 6,
  },
  addFromSearchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 20,
    backgroundColor: dark.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addFromSearchText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },

  // ── FAB ────────────────────────────────────────────────────

  // ── Sort chips ─────────────────────────────────────────────
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.surfaceHighlight,
  },
  sortChipActive: {
    backgroundColor: dark.accent + "22",
    borderColor: dark.accent,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: dark.textMuted,
  },
  sortChipTextActive: {
    color: dark.accent,
    fontWeight: "700",
  },
});
