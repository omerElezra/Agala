import { dark } from "@/constants/theme";
import { CategorySheet } from "@/src/components/CategorySheet";
import { RecommendationLine } from "@/src/components/RecommendationLine";
import { ShoppingListItem } from "@/src/components/ShoppingListItem";
import { SnoozeSheet } from "@/src/components/SnoozeSheet";
import { useAuth } from "@/src/hooks/useAuth";
import { useSpeechRecognition } from "@/src/hooks/useSpeechRecognition";
import { supabase } from "@/src/lib/supabase";
import { useAppSettingsStore } from "@/src/store/appSettingsStore";
import {
  useShoppingListStore,
  type RecommendationItem,
  type ShoppingItem,
} from "@/src/store/shoppingListStore";
import {
  CATEGORY_EMOJIS,
  detectCategory,
  isValidCategory,
  normalizeCategory,
} from "@/src/utils/categoryDetector";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

type CartSortMode = "name" | "category" | "recent";
type AllProductsSortMode = "name" | "category" | "recent" | "depletion";

const CART_SORT_OPTIONS: { key: CartSortMode; label: string }[] = [
  { key: "recent", label: "שונה לאחרונה" },
  { key: "name", label: "שם" },
  { key: "category", label: "קטגוריה" },
];

const ALL_SORT_OPTIONS: { key: AllProductsSortMode; label: string }[] = [
  { key: "recent", label: "שונה לאחרונה" },
  { key: "name", label: "שם" },
  { key: "category", label: "קטגוריה" },
  { key: "depletion", label: "עומד להיגמר" },
];

/** Hebrew depletion title + color — how close to running out */
function getDepletionLabel(pct: number): { title: string; color: string } {
  if (pct >= 100) return { title: "לך תקנה", color: "rgba(239, 68, 68, 0.7)" }; // Red
  if (pct >= 80) return { title: "תכף נגמר", color: "rgba(249, 115, 22, 0.7)" }; // Orange
  if (pct >= 60)
    return { title: "חצי קלאץ'", color: "rgba(251, 191, 36, 0.7)" }; // Yellow
  if (pct >= 30) return { title: "יש, אל תדאג", color: dark.textSecondary };
  if (pct >= 1) return { title: "יש בשפע", color: dark.textSecondary };
  return { title: "הרגע קנינו", color: dark.textMuted };
}

type ListRow =
  | ShoppingItem
  | { type: "header"; title: string; emoji: string; key: string }
  | { type: "cart-category"; title: string; emoji: string; key: string }
  | { type: "divider"; key: string }
  | { type: "all-products-header"; key: string }
  | { type: "all-product-category"; title: string; emoji: string; key: string }
  | { type: "all-product-item"; item: ShoppingItem; key: string }
  | { type: "recommendations"; key: string };

export default function HomeScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    items,
    recommendations,
    depletionPercentMap,
    isLoading,
    autoAddedProductIds,
    fetchList,
    subscribeRealtime,
    checkOffItem,
    snoozeItem,
    removeItem,
    acceptRecommendation,
    skipRecommendation,
    flushOfflineQueue,
  } = useShoppingListStore();

  const addItem = useShoppingListStore((s) => s.addItem);
  const { showRecommendations, showDepletion } = useAppSettingsStore();

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
  const [showCart, setShowCart] = useState(true);
  const [isAddingFromSearch, setIsAddingFromSearch] = useState(false);
  const [cartSort, setCartSort] = useState<CartSortMode>("recent");
  const [cartSortAsc, setCartSortAsc] = useState(true);
  const [allProductsSort, setAllProductsSort] =
    useState<AllProductsSortMode>("recent");
  const [allProductsSortAsc, setAllProductsSortAsc] = useState(true);

  // ── Bulk import ────────────────────────────────────────────
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualText, setManualText] = useState("");
  const [importBanner, setImportBanner] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // ── Voice input ────────────────────────────────────────────
  const {
    isAvailable: voiceAvailable,
    isListening,
    startListening,
    stopListening,
  } = useSpeechRecognition((text) => setSearchQuery(text));

  // ── Bulk import helpers ─────────────────────────────────────
  const showImportBanner = (text: string, type: "success" | "error") => {
    setImportBanner({ text, type });
    setTimeout(() => setImportBanner(null), 3_000);
  };

  const handleBulkImport = useCallback(
    async (text: string) => {
      if (!user?.household_id) return;
      setImporting(true);
      try {
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        const firstLine = lines[0]?.toLowerCase() ?? "";
        const startIdx =
          firstLine.includes("name") ||
          firstLine.includes("\u05e9\u05dd") ||
          firstLine.includes("product")
            ? 1
            : 0;

        let added = 0;
        let skipped = 0;

        for (let i = startIdx; i < lines.length; i++) {
          const parts = lines[i]!.split(",").map((p) =>
            p.trim().replace(/^"|"$/g, ""),
          );
          const name = parts[0];
          if (!name || name.length < 1) continue;

          const quantity = parts[1] ? parseInt(parts[1], 10) || 1 : 1;
          const category = detectCategory(name);

          const { data: existingProduct } = await supabase
            .from("products")
            .select("id")
            .eq("name", name)
            .maybeSingle();

          let productId: string;
          if (existingProduct) {
            productId = existingProduct.id;
          } else {
            const { data: newProduct, error: prodErr } = await supabase
              .from("products")
              .insert({ name, category })
              .select("id")
              .single();

            if (prodErr || !newProduct) {
              skipped++;
              continue;
            }
            productId = newProduct.id;
          }

          const result = addItem(productId, user.household_id, quantity);
          if (result === "added") {
            added++;
          } else {
            skipped++;
          }
        }

        await fetchList(user.household_id);
        const msg =
          `\u2705 \u05d9\u05d5\u05d1\u05d0\u05d5 ${added} \u05e4\u05e8\u05d9\u05d8\u05d9\u05dd` +
          (skipped > 0 ? ` (\u05d3\u05d5\u05dc\u05d2\u05d5 ${skipped})` : "");
        showImportBanner(msg, "success");
      } catch (err) {
        console.error("[bulk-import]", err);
        showImportBanner(
          "\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05d9\u05d9\u05d1\u05d5\u05d0",
          "error",
        );
      } finally {
        setImporting(false);
      }
    },
    [user, addItem, fetchList],
  );

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/plain",
          "text/comma-separated-values",
          "application/csv",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const file = new ExpoFile(asset.uri);
      const content = await file.text();
      if (content && content.trim().length > 0) {
        handleBulkImport(content);
      } else {
        showImportBanner(
          "\u05d4\u05e7\u05d5\u05d1\u05e5 \u05e8\u05d9\u05e7",
          "error",
        );
      }
    } catch (err) {
      console.error("[file-pick]", err);
      showImportBanner(
        "\u05e9\u05d2\u05d9\u05d0\u05d4 \u05d1\u05d1\u05d7\u05d9\u05e8\u05ea \u05d4\u05e7\u05d5\u05d1\u05e5",
        "error",
      );
    }
  }, [handleBulkImport]);

  const handleManualImport = useCallback(() => {
    if (!manualText.trim()) {
      showImportBanner(
        "\u05d4\u05d6\u05d9\u05e0\u05d5 \u05dc\u05e4\u05d7\u05d5\u05ea \u05de\u05d5\u05e6\u05e8 \u05d0\u05d7\u05d3",
        "error",
      );
      return;
    }
    handleBulkImport(manualText);
    setManualText("");
    setShowManualInput(false);
  }, [manualText, handleBulkImport]);

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

      // Fix legacy category on existing product if needed
      if (productToAdd?.category && !isValidCategory(productToAdd.category)) {
        const fixed = normalizeCategory(productToAdd.category);
        if (fixed !== "ללא קטגוריה") {
          await supabase
            .from("products")
            .update({ category: fixed })
            .eq("id", productToAdd.id);
          productToAdd = { ...productToAdd, category: fixed };
        }
      }

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
            if (similar?.category && isValidCategory(similar.category))
              category = similar.category;
          }
        }

        // If still no category, ask the user to pick one via CategorySheet
        if (!category) {
          setPendingAddName(trimmed);
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
      setCartSortAsc(true);
      setAllProductsSort("recent");
      setAllProductsSortAsc(true);
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
          setPendingAddName(null);
          return;
        }

        addItem(newProduct.id, user.household_id, 1, newProduct, false);
        setPendingAddName(null);
        setSearchQuery("");
        await fetchList(user.household_id);
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

  const handleAcceptRecommendation = useCallback(
    (rec: RecommendationItem) => {
      acceptRecommendation(rec);
    },
    [acceptRecommendation],
  );

  const handleSkipRecommendation = useCallback(
    (rec: RecommendationItem) => {
      skipRecommendation(rec);
    },
    [skipRecommendation],
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

    const isSearching = searchQuery.trim().length > 0;

    // Recommendations row (before sections) — hide during search
    if (!isSearching && showRecommendations && recommendations.length > 0) {
      data.push({ type: "recommendations", key: "recs" });
    }

    // Section 1: Cart items ("עגלה שלי")
    if (filteredActive.length > 0) {
      data.push({
        type: "header",
        title: `עגלה שלי`,
        emoji: "",
        key: "h-cart",
      });

      if (showCart) {
        // Sort cart items based on selected mode
        const cd = cartSortAsc ? 1 : -1;
        if (cartSort === "category") {
          // Group by category with headers
          const byCategory = new Map<string, ShoppingItem[]>();
          for (const item of filteredActive) {
            const cat = normalizeCategory(item.product?.category ?? null);
            if (!byCategory.has(cat)) byCategory.set(cat, []);
            byCategory.get(cat)!.push(item);
          }
          const sortedCats = [...byCategory.keys()].sort(
            (a, b) => a.localeCompare(b, "he") * cd,
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
              (a.product?.name ?? "").localeCompare(
                b.product?.name ?? "",
                "he",
              ),
            );
            data.push(...catItems);
          }
        } else if (cartSort === "recent") {
          // Sort by most recently added
          const sorted = [...filteredActive].sort(
            (a, b) =>
              (new Date(b.added_at).getTime() -
                new Date(a.added_at).getTime()) *
              cd,
          );
          data.push(...sorted);
        } else {
          // Sort by name
          const sorted = [...filteredActive].sort(
            (a, b) =>
              (a.product?.name ?? "").localeCompare(
                b.product?.name ?? "",
                "he",
              ) * cd,
          );
          data.push(...sorted);
        }
      } // end showCart
    }

    // Divider
    if (filteredActive.length > 0 && filteredPurchased.length > 0) {
      data.push({ type: "divider", key: "divider-1" });
    }

    // Section 2: All products ("כל המוצרים")
    if (filteredPurchased.length > 0) {
      data.push({ type: "all-products-header", key: "h-all" });

      if (showAllProducts) {
        const ad = allProductsSortAsc ? 1 : -1;
        if (allProductsSort === "category") {
          // Group by category
          const byCategory = new Map<string, ShoppingItem[]>();
          for (const item of filteredPurchased) {
            const cat = normalizeCategory(item.product?.category ?? null);
            if (!byCategory.has(cat)) byCategory.set(cat, []);
            byCategory.get(cat)!.push(item);
          }

          const sortedCats = [...byCategory.keys()].sort(
            (a, b) => a.localeCompare(b, "he") * ad,
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
          // Flat sort by name, recent, or depletion — no category headers
          const sorted = [...filteredPurchased].sort((a, b) => {
            if (allProductsSort === "recent") {
              return (
                (new Date(b.added_at).getTime() -
                  new Date(a.added_at).getTime()) *
                ad
              );
            }
            if (allProductsSort === "depletion") {
              const da = depletionPercentMap.get(a.product_id) ?? -1;
              const db = depletionPercentMap.get(b.product_id) ?? -1;
              return (db - da) * ad;
            }
            return (
              (a.product?.name ?? "").localeCompare(
                b.product?.name ?? "",
                "he",
              ) * ad
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
    showCart,
    cartSort,
    cartSortAsc,
    allProductsSort,
    allProductsSortAsc,
    depletionPercentMap,
    showRecommendations,
    recommendations,
    searchQuery,
  ]);

  // ── Sticky header indices for pinned section titles ──────
  const stickyIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < listData.length; i++) {
      const row = listData[i]!;
      if (
        "type" in row &&
        (row.type === "header" || row.type === "all-products-header")
      ) {
        indices.push(i);
      }
    }
    return indices;
  }, [listData]);

  // ── Render helpers ─────────────────────────────────────────
  const renderRow = useCallback(
    ({ item: row }: { item: ListRow }) => {
      // Recommendations row
      if ("type" in row && row.type === "recommendations") {
        return (
          <RecommendationLine
            recommendations={recommendations}
            onAdd={handleAcceptRecommendation}
            onSkip={handleSkipRecommendation}
          />
        );
      }

      // Cart section header
      if ("type" in row && row.type === "header") {
        return (
          <View style={{ backgroundColor: dark.background }}>
            <TouchableOpacity
              style={styles.cartHeader}
              onPress={() => setShowCart((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionLine} />
              <View style={styles.sectionTitleRow}>
                <Text style={styles.cartTitle}>{row.title}</Text>
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>
                    {filteredActive.length} פריטים
                  </Text>
                </View>
                <Text style={styles.toggleArrow}>{showCart ? "▲" : "▼"}</Text>
              </View>
              <View style={styles.sectionLine} />
            </TouchableOpacity>
            {showCart && (
              <View style={styles.sortRow}>
                <Ionicons
                  name="swap-vertical"
                  size={14}
                  color={dark.textMuted}
                  style={{ marginEnd: 6 }}
                />
                {CART_SORT_OPTIONS.map((opt) => {
                  const isActive = cartSort === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.sortChip,
                        isActive && styles.sortChipActive,
                      ]}
                      onPress={() => {
                        if (isActive) {
                          setCartSortAsc((v) => !v);
                        } else {
                          setCartSort(opt.key);
                          setCartSortAsc(true);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.sortChipText,
                          isActive && styles.sortChipTextActive,
                        ]}
                      >
                        {opt.label}
                        {isActive ? (cartSortAsc ? " ↑" : " ↓") : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
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
          <View style={{ backgroundColor: dark.background }}>
            <TouchableOpacity
              style={styles.allProductsHeader}
              onPress={() => setShowAllProducts((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionLine} />
              <View style={styles.sectionTitleRow}>
                <Text style={styles.allProductsTitle}>הקטלוג שלי</Text>
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>
                    {filteredPurchased.length} פריטים
                  </Text>
                </View>
                <Text style={styles.toggleArrow}>
                  {showAllProducts ? "▲" : "▼"}
                </Text>
              </View>
              <View style={styles.sectionLine} />
            </TouchableOpacity>
            {showAllProducts && (
              <View style={styles.sortRow}>
                <Ionicons
                  name="swap-vertical"
                  size={14}
                  color={dark.textMuted}
                  style={{ marginEnd: 6 }}
                />
                {ALL_SORT_OPTIONS.map((opt) => {
                  const isActive = allProductsSort === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[
                        styles.sortChip,
                        isActive && styles.sortChipActive,
                      ]}
                      onPress={() => {
                        if (isActive) {
                          setAllProductsSortAsc((v) => !v);
                        } else {
                          setAllProductsSort(opt.key);
                          setAllProductsSortAsc(true);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.sortChipText,
                          isActive && styles.sortChipTextActive,
                        ]}
                      >
                        {opt.label}
                        {isActive ? (allProductsSortAsc ? " ↑" : " ↓") : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
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
        const depletion = showDepletion
          ? depletionPercentMap.get(row.item.product_id)
          : undefined;
        const deplLabel =
          depletion != null ? getDepletionLabel(depletion) : null;
        return (
          <View style={styles.allProductCard}>
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
            {deplLabel && (
              <View style={styles.depletionEnd}>
                <Text style={[styles.depletionPct, { color: deplLabel.color }]}>
                  {depletion}%
                </Text>
                <Text
                  style={[styles.depletionTitle, { color: deplLabel.color }]}
                >
                  {deplLabel.title}
                </Text>
              </View>
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
      showCart,
      activeProductIds,
      checkOffItem,
      handleSwipe,
      router,
      user?.household_id,
      cartSort,
      allProductsSort,
      depletionPercentMap,
      showDepletion,
      recommendations,
      handleAcceptRecommendation,
      handleSkipRecommendation,
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
    <SafeAreaView style={styles.container} edges={[]}>
      {/* ── Sticky header area ── */}
      <View style={styles.headerArea}>
        {/* Title row */}

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
            {voiceAvailable && (
              <TouchableOpacity
                style={[styles.micBtn, isListening && styles.micBtnActive]}
                onPress={isListening ? stopListening : startListening}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isListening ? "mic" : "mic-outline"}
                  size={20}
                  color={isListening ? "#fff" : dark.accent}
                />
              </TouchableOpacity>
            )}
            {/* Bulk import icon */}
            <TouchableOpacity
              style={styles.bulkImportBtn}
              onPress={() => setShowImportSheet(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="list-outline" size={18} color={dark.secondary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* \"Not found\" overlay — rendered outside FlatList to avoid Fabric view recycling crash */}
      {searchQuery.trim().length > 0 &&
      filteredActive.length === 0 &&
      filteredPurchased.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="search-outline" size={48} color={dark.textMuted} />
          <Text style={styles.emptyText}>לא נמצאו תוצאות</Text>
          <Text style={styles.emptySubtext}>
            &quot;{searchQuery.trim()}&quot; לא נמצא ברשימה
          </Text>
          <TouchableOpacity
            style={[
              styles.addFromSearchBtn,
              (isAddingFromSearch || !!pendingAddName) && { opacity: 0.6 },
            ]}
            onPress={handleAddFromSearch}
            activeOpacity={0.7}
            disabled={isAddingFromSearch || !!pendingAddName}
          >
            {isAddingFromSearch ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
            )}
            <Text style={styles.addFromSearchText}>
              {isAddingFromSearch
                ? "מוסיף..."
                : pendingAddName
                  ? "בחרו קטגוריה..."
                  : `הוסף "${searchQuery.trim()}" לרשימה`}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Main scrollable content */
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
          extraData={depletionPercentMap}
          stickyHeaderIndices={stickyIndices}
          renderItem={renderRow}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🛒</Text>
              <Text style={styles.emptyText}>הרשימה ריקה!</Text>
              <Text style={styles.emptySubtext}>
                חפשו מוצר בשורת החיפוש למעלה
              </Text>
            </View>
          }
        />
      )}

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
      {/* ── Bulk Import Sheet ───────────────────────────────── */}
      <Modal
        visible={showImportSheet}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          setShowImportSheet(false);
          setShowManualInput(false);
          setManualText("");
        }}
      >
        <TouchableOpacity
          style={styles.importOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowImportSheet(false);
            setShowManualInput(false);
            setManualText("");
          }}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.importSheet, { paddingBottom: Math.max(32, insets.bottom + 16) }]}>
            {/* Handle bar */}
            <View style={styles.importHandle} />

            <Text style={styles.importTitle}>הוספה מרובה</Text>
            <Text style={styles.importHint}>
              הוסיפו מוצרים מקובץ, מהלוח, או הקלידו ידנית.{"\n"}
              פורמט: שם מוצר בכל שורה, או שם,כמות
            </Text>

            {/* Options */}
            <View style={styles.importOptions}>
              <TouchableOpacity
                style={[
                  styles.importOptionBtn,
                  importing && styles.importOptionDisabled,
                ]}
                onPress={handlePickFile}
                disabled={importing}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="document-text-outline"
                  size={22}
                  color={dark.accent}
                />
                <Text style={styles.importOptionText}>טען מקובץ</Text>
                <Text style={styles.importOptionSub}>CSV, TXT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.importOptionBtn,
                  importing && styles.importOptionDisabled,
                ]}
                onPress={() => setShowManualInput((v) => !v)}
                disabled={importing}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="create-outline"
                  size={22}
                  color={dark.warning}
                />
                <Text style={styles.importOptionText}>הקלדה ידנית</Text>
                <Text style={styles.importOptionSub}>הזינו מוצרים בעצמכם</Text>
              </TouchableOpacity>
            </View>

            {/* Manual text area */}
            {showManualInput && (
              <View style={styles.importManualArea}>
                <TextInput
                  style={styles.importManualInput}
                  value={manualText}
                  onChangeText={setManualText}
                  placeholder={"חלב\nביצים,2\nלחם"}
                  placeholderTextColor={dark.placeholder}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[
                    styles.importSubmitBtn,
                    (!manualText.trim() || importing) &&
                      styles.importOptionDisabled,
                  ]}
                  onPress={handleManualImport}
                  disabled={!manualText.trim() || importing}
                  activeOpacity={0.8}
                >
                  <Text style={styles.importSubmitText}>
                    {importing ? "מייבא..." : "📥 ייבא פריטים"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Loading */}
            {importing && (
              <View style={styles.importLoadingRow}>
                <ActivityIndicator size="small" color={dark.accent} />
                <Text style={styles.importLoadingText}>מייבא פריטים...</Text>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Import result popup ─────────────────────────────── */}
      <Modal
        visible={!!importBanner}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setImportBanner(null)}
      >
        <TouchableOpacity
          style={styles.importPopupOverlay}
          activeOpacity={1}
          onPress={() => setImportBanner(null)}
        >
          <View
            style={[
              styles.importPopupCard,
              importBanner?.type === "success"
                ? styles.importPopupSuccess
                : styles.importPopupError,
            ]}
          >
            <Text style={styles.importPopupEmoji}>
              {importBanner?.type === "success" ? "\u2705" : "\u274c"}
            </Text>
            <Text style={styles.importPopupText}>{importBanner?.text}</Text>
          </View>
        </TouchableOpacity>
      </Modal>
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
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.surface,
    borderWidth: 1.5,
    borderColor: dark.accent,
    alignItems: "center",
    justifyContent: "center",
    marginStart: 4,
  },
  micBtnActive: {
    backgroundColor: dark.error,
    borderColor: dark.error,
  },
  bulkImportBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: dark.surface,
    borderWidth: 1.5,
    borderColor: dark.secondary,
    alignItems: "center",
    justifyContent: "center",
    marginStart: 4,
  },

  // ── Bulk import sheet ──────────────────────────────────────
  importOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  importSheet: {
    backgroundColor: dark.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderColor: dark.border,
  },
  importHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: dark.textMuted,
    alignSelf: "center",
    marginBottom: 16,
  },
  importTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: dark.text,
    textAlign: "left",
    marginBottom: 6,
  },
  importHint: {
    fontSize: 13,
    color: dark.textSecondary,
    textAlign: "left",
    lineHeight: 20,
    marginBottom: 16,
  },
  importOptions: {
    gap: 10,
  },
  importOptionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: dark.background,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.border,
  },
  importOptionDisabled: {
    opacity: 0.4,
  },
  importOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: dark.text,
    textAlign: "left",
  },
  importOptionSub: {
    fontSize: 11,
    color: dark.textSecondary,
    fontWeight: "500",
    textAlign: "right",
  },
  importManualArea: {
    marginTop: 12,
    gap: 10,
  },
  importManualInput: {
    fontSize: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: dark.inputBorder,
    borderRadius: 14,
    backgroundColor: dark.input,
    color: dark.inputText,
    writingDirection: "rtl",
    minHeight: 120,
  },
  importSubmitBtn: {
    backgroundColor: dark.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  importSubmitText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  importLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  importLoadingText: {
    fontSize: 13,
    color: dark.textSecondary,
    fontWeight: "600",
  },
  importPopupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  importPopupCard: {
    backgroundColor: dark.surfaceElevated,
    borderRadius: 22,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    borderWidth: 1.5,
  },
  importPopupSuccess: {
    borderColor: dark.success,
  },
  importPopupError: {
    borderColor: dark.error,
  },
  importPopupEmoji: {
    fontSize: 36,
    marginBottom: 12,
  },
  importPopupText: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: dark.text,
    lineHeight: 24,
  },

  // ── Cart section header ────────────────────────────────────
  cartHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: dark.background,
  },
  cartTitle: {
    fontSize: 18,
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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: dark.background,
  },
  allProductsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: dark.textSecondary,
  },
  toggleArrow: {
    fontSize: 12,
    color: dark.textMuted,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: dark.surfaceHighlight,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
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
    direction: "rtl",
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
    fontSize: 15,
    fontWeight: "500",
    color: "#D1D5DB", // gray-300
  },
  allProductNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  predictionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  allProductNameInCart: {
    textDecorationLine: "line-through",
  },
  allProductSub: {
    fontSize: 11,
    color: dark.textSecondary,
    marginTop: 2,
  },
  depletionEnd: {
    alignItems: "center",
    justifyContent: "center",
    marginStart: 10,
  },
  depletionPct: {
    fontSize: 12,
    fontWeight: "700",
  },
  depletionTitle: {
    fontSize: 8,
    fontWeight: "500",
    marginTop: 1,
  },
  categoryEditRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(139,159,232,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginEnd: 12,
  },
  inCartBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: dark.success + "1A",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginEnd: 12,
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
    paddingHorizontal: 22,
    paddingBottom: 8,
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.surfaceHighlight,
  },
  sortChipActive: {
    backgroundColor: dark.accent + "22",
    borderColor: dark.accent,
  },
  sortChipText: {
    fontSize: 11,
    fontWeight: "500",
    color: dark.textMuted,
  },
  sortChipTextActive: {
    color: dark.accent,
    fontWeight: "700",
  },
});
