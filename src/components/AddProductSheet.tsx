import { dark } from "@/constants/theme";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useShoppingListStore } from "../store/shoppingListStore";
import type { Database } from "../types/database";
import { detectCategory } from "../utils/categoryDetector";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

interface AddProductSheetProps {
  householdId: string;
  onClose: () => void;
  initialQuery?: string;
}

export function AddProductSheet({
  householdId,
  onClose,
  initialQuery = "",
}: AddProductSheetProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<ProductRow[]>([]);
  const [recentProducts, setRecentProducts] = useState<ProductRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(
    null,
  );
  const [quantity, setQuantity] = useState(1);
  const [existsMessage, setExistsMessage] = useState<string | null>(null);
  const addItem = useShoppingListStore((s) => s.addItem);

  // ── Fetch recently purchased products ──────────────────────
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("shopping_list")
        .select("product:products(*)")
        .eq("household_id", householdId)
        .eq("status", "purchased")
        .order("purchased_at", { ascending: false })
        .limit(200);

      if (data) {
        // Deduplicate by product id and filter nulls
        const seen = new Set<string>();
        const products: ProductRow[] = [];
        for (const row of data) {
          const p = (row as any).product as ProductRow | null;
          if (p && !seen.has(p.id)) {
            seen.add(p.id);
            products.push(p);
          }
          if (products.length >= 8) break;
        }
        setRecentProducts(products);
      }
    })();
  }, [householdId]);

  // ── Debounced search (300 ms) ──────────────────────────────
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase
        .from("products")
        .select("*")
        .ilike("name", `%${query}%`)
        .limit(15);

      setResults(data ?? []);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback((product: ProductRow) => {
    setSelectedProduct(product);
    setQuantity(1);
  }, []);

  const handleConfirmAdd = useCallback(async () => {
    if (!selectedProduct) return;
    setExistsMessage(null);
    const result = addItem(
      selectedProduct.id,
      householdId,
      quantity,
      selectedProduct,
    );
    if (result === "exists") {
      setExistsMessage(`"${selectedProduct.name}" כבר נמצא ברשימה`);
      return;
    }
    onClose();
  }, [selectedProduct, quantity, addItem, householdId, onClose]);

  const handleCancelSelection = useCallback(() => {
    setSelectedProduct(null);
    setQuantity(1);
  }, []);

  const items = useShoppingListStore((s) => s.items);

  const handleCreateCustom = useCallback(async () => {
    if (query.trim().length === 0) return;
    setExistsMessage(null);

    const trimmed = query.trim();

    // 1. Check if an active item with the same product name already exists
    const duplicate = items.find(
      (i) =>
        i.status === "active" &&
        i.product?.name?.toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      setExistsMessage(`"${trimmed}" כבר נמצא ברשימה`);
      return;
    }

    // 2. Reuse existing product if one with this name exists
    const { data: existingProduct } = await supabase
      .from("products")
      .select("*")
      .ilike("name", trimmed)
      .limit(1)
      .maybeSingle();

    let productToAdd: ProductRow;

    if (existingProduct) {
      productToAdd = existingProduct;
    } else {
      // Try to detect category automatically
      let category: string | null = detectCategory(trimmed);

      // Fallback: look for a similar product name in DB to copy its category
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

      const { data: newProduct, error } = await supabase
        .from("products")
        .insert({
          name: trimmed,
          is_custom: true,
          created_by_household: householdId,
          ...(category ? { category } : {}),
        })
        .select()
        .single();

      if (error || !newProduct) {
        console.error("[AddProduct] create error:", error?.message);
        return;
      }
      productToAdd = newProduct;
    }

    const result = addItem(
      productToAdd.id,
      householdId,
      quantity,
      productToAdd,
    );
    if (result === "exists") {
      setExistsMessage(`"${trimmed}" כבר נמצא ברשימה`);
      return;
    }
    onClose();
  }, [query, householdId, addItem, onClose, quantity, items]);

  // Handle selecting a product from recent chips
  const handleRecentChipPress = useCallback(
    (product: ProductRow) => {
      setExistsMessage(null);
      const result = addItem(product.id, householdId, 1, product);
      if (result === "exists") {
        setExistsMessage(`"${product.name}" כבר נמצא ברשימה`);
        return;
      }
      onClose();
    },
    [addItem, householdId, onClose],
  );

  // Show recent products only when search is empty
  const showRecent = query.length < 2 && recentProducts.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>הוספת מוצר</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Search input */}
      <TextInput
        style={styles.input}
        placeholder="...חפש מוצר"
        placeholderTextColor={dark.placeholder}
        value={query}
        onChangeText={setQuery}
        autoFocus
      />

      {isSearching && <Text style={styles.searching}>מחפש...</Text>}

      {/* "Already in cart" message */}
      {existsMessage && (
        <View style={styles.existsBanner}>
          <Text style={styles.existsText}>⚠️ {existsMessage}</Text>
        </View>
      )}

      {/* Quantity picker — shown after selecting a product */}
      {selectedProduct && (
        <View style={styles.qtySection}>
          <Text style={styles.qtyProductName}>{selectedProduct.name}</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Text style={styles.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={() => setQuantity((q) => q + 1)}
            >
              <Text style={styles.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.qtyActions}>
            <TouchableOpacity
              style={styles.qtyConfirmBtn}
              onPress={handleConfirmAdd}
            >
              <Text style={styles.qtyConfirmText}>הוסף לרשימה</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.qtyCancelBtn}
              onPress={handleCancelSelection}
            >
              <Text style={styles.qtyCancelText}>חזרה</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Recently purchased — shown when no search query */}
      {showRecent && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>🕐 נרכשו לאחרונה</Text>
          <View style={styles.recentGrid}>
            {recentProducts.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.recentChip}
                onPress={() => handleSelect(p)}
                activeOpacity={0.7}
              >
                <Text style={styles.recentChipText}>{p.name}</Text>
                <Text style={styles.recentPlus}>+</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Empty search hint */}
      {query.length > 0 && query.length < 2 && (
        <Text style={styles.hintText}>הקלידו לפחות 2 תווים לחיפוש</Text>
      )}

      {/* No results */}
      {query.length >= 2 && !isSearching && results.length === 0 && (
        <View style={styles.noResults}>
          <Text style={styles.noResultsEmoji}>🔍</Text>
          <Text style={styles.noResultsText}>
            לא נמצאו תוצאות עבור &quot;{query}&quot;
          </Text>
          <Text style={styles.noResultsHint}>
            ניתן ליצור מוצר חדש בלחיצה למטה
          </Text>
        </View>
      )}

      {/* Results list */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.resultRow}
            onPress={() => handleSelect(item)}
          >
            {item.category && (
              <Text style={styles.resultCat}>{item.category}</Text>
            )}
            <Text style={styles.resultName}>{item.name}</Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          query.trim().length >= 2 ? (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleCreateCustom}
            >
              <Text style={styles.createBtnText}>
                + הוסף &quot;{query.trim()}&quot; כמוצר חדש
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </View>
  );
}

// ── Styles (RTL-safe) ────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
    paddingTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingStart: 16,
    paddingEnd: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    color: dark.text,
  },
  closeBtn: {
    fontSize: 22,
    color: dark.textSecondary,
    fontWeight: "300",
  },
  input: {
    marginStart: 16,
    marginEnd: 16,
    marginVertical: 16,
    padding: 14,
    fontSize: 16,
    backgroundColor: dark.input,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: dark.inputBorder,
    color: dark.inputText,
  },
  searching: {
    textAlign: "center",
    color: dark.secondary,
    fontSize: 14,
    marginBottom: 8,
    fontWeight: "600",
  },
  existsBanner: {
    backgroundColor: dark.warningBg,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: dark.warning + "44",
  },
  existsText: {
    color: dark.warning,
    fontSize: 14,
    fontWeight: "700",
  },
  list: {
    flex: 1,
    paddingStart: 16,
    paddingEnd: 16,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.border,
  },
  resultName: {
    fontSize: 16,
    color: dark.text,
    fontWeight: "600",
  },
  resultCat: {
    fontSize: 13,
    color: dark.textSecondary,
    fontWeight: "500",
  },
  createBtn: {
    padding: 16,
    alignItems: "center",
    backgroundColor: dark.successBg,
    borderRadius: 14,
    marginTop: 10,
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: dark.success,
  },
  createBtnText: {
    fontSize: 15,
    color: dark.success,
    fontWeight: "700",
  },
  recentSection: {
    paddingStart: 16,
    paddingEnd: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: dark.secondary,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: dark.chip,
    borderRadius: 22,
    paddingVertical: 9,
    paddingStart: 16,
    paddingEnd: 12,
    borderWidth: 1.5,
    borderColor: dark.chipBorder,
    gap: 8,
  },
  recentChipText: {
    fontSize: 14,
    color: dark.chipText,
    fontWeight: "500",
  },
  recentPlus: {
    fontSize: 17,
    fontWeight: "800",
    color: dark.secondary,
  },
  hintText: {
    textAlign: "center",
    color: dark.textMuted,
    fontSize: 14,
    marginTop: 20,
  },
  noResults: {
    alignItems: "center",
    paddingTop: 30,
    paddingBottom: 10,
  },
  noResultsEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  noResultsText: {
    fontSize: 15,
    color: dark.textSecondary,
    fontWeight: "700",
  },
  noResultsHint: {
    fontSize: 13,
    color: dark.textMuted,
    marginTop: 4,
  },
  qtySection: {
    marginStart: 16,
    marginEnd: 16,
    marginBottom: 12,
    padding: 18,
    backgroundColor: dark.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: dark.accent,
  },
  qtyProductName: {
    fontSize: 17,
    fontWeight: "800",
    color: dark.text,
    textAlign: "center",
    marginBottom: 14,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  qtyLabel: {
    fontSize: 15,
    color: dark.textSecondary,
    fontWeight: "700",
  },
  qtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: dark.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "800",
    lineHeight: 22,
  },
  qtyValue: {
    fontSize: 24,
    fontWeight: "800",
    color: dark.text,
    minWidth: 32,
    textAlign: "center",
  },
  qtyActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 16,
  },
  qtyConfirmBtn: {
    paddingVertical: 12,
    paddingStart: 22,
    paddingEnd: 22,
    backgroundColor: dark.success,
    borderRadius: 14,
  },
  qtyConfirmText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  qtyCancelBtn: {
    paddingVertical: 12,
    paddingStart: 16,
    paddingEnd: 16,
  },
  qtyCancelText: {
    color: dark.textMuted,
    fontSize: 14,
    fontWeight: "500",
  },
});
