import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useShoppingListStore,
  type ShoppingItem,
  type SuggestionItem,
} from '@/src/store/shoppingListStore';
import { useAuth } from '@/src/hooks/useAuth';
import { dark } from '@/constants/theme';
import { SuggestionChips } from '@/src/components/SuggestionChips';
import { ShoppingListItem } from '@/src/components/ShoppingListItem';
import { SnoozeSheet } from '@/src/components/SnoozeSheet';
import { AddProductSheet } from '@/src/components/AddProductSheet';

// ── FlatList union type (section headers mixed with items) ────
type SortMode = 'default' | 'name' | 'category';
type ListRow =
  | ShoppingItem
  | { type: 'header'; title: string; emoji: string; key: string };

export default function HomeScreen() {
  const { user, isLoading: authLoading } = useAuth();

  const {
    items,
    suggestions,
    isLoading,
    pendingPurchases,
    autoAddedProductIds,
    fetchList,
    subscribeRealtime,
    checkOffItem,
    undoCheckOff,
    snoozeItem,
    removeItem,
    acceptSuggestion,
    flushOfflineQueue,
  } = useShoppingListStore();

  const [snoozeTarget, setSnoozeTarget] = useState<ShoppingItem | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPurchased, setShowPurchased] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('default');

  // ── Bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    if (!user?.household_id) return;

    fetchList(user.household_id);
    const unsub = subscribeRealtime(user.household_id);
    flushOfflineQueue();

    return unsub;
  }, [user?.household_id, fetchList, subscribeRealtime, flushOfflineQueue]);

  // ── Pull-to-refresh ────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    if (!user?.household_id) return;
    setRefreshing(true);
    await fetchList(user.household_id);
    setRefreshing(false);
  }, [user?.household_id, fetchList]);

  // ── Split items into 3 sections ────────────────────────────
  const { autoAdded, manual, purchased } = useMemo(() => {
    const auto: ShoppingItem[] = [];
    const man: ShoppingItem[] = [];
    const purch: ShoppingItem[] = [];

    for (const item of items) {
      if (item.status === 'purchased') {
        purch.push(item);
      } else if (autoAddedProductIds.has(item.product_id)) {
        auto.push(item);
      } else {
        man.push(item);
      }
    }

    return { autoAdded: auto, manual: man, purchased: purch };
  }, [items, autoAddedProductIds]);

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

  const handleAcceptSuggestion = useCallback(
    (suggestion: SuggestionItem) => {
      acceptSuggestion(suggestion);
    },
    [acceptSuggestion],
  );

  // ── Render helpers ─────────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: ShoppingItem }) => (
      <ShoppingListItem
        item={item}
        isPending={pendingPurchases.has(item.id)}
        onCheckOff={checkOffItem}
        onUndo={undoCheckOff}
        onSwipe={handleSwipe}
      />
    ),
    [pendingPurchases, checkOffItem, undoCheckOff, handleSwipe],
  );

  // ── Build flat list data with section headers ──────────────
  const listData = useMemo<ListRow[]>(() => {
    const data: ListRow[] = [];

    // Helper: sort items by the current mode
    const sortItems = (arr: ShoppingItem[]): ShoppingItem[] => {
      if (sortMode === 'name') {
        return [...arr].sort((a, b) =>
          (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'he'),
        );
      }
      if (sortMode === 'category') {
        return [...arr].sort((a, b) => {
          const catA = a.product?.category ?? 'ללא קטגוריה';
          const catB = b.product?.category ?? 'ללא קטגוריה';
          const catCmp = catA.localeCompare(catB, 'he');
          if (catCmp !== 0) return catCmp;
          return (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'he');
        });
      }
      return arr; // default: keep original order
    };

    // When sorting by category, group active items (auto + manual) by category
    if (sortMode === 'category') {
      const allActive = [...autoAdded, ...manual];
      const sorted = sortItems(allActive);

      // Group by category
      let lastCat = '';
      for (const item of sorted) {
        const cat = item.product?.category || 'ללא קטגוריה';
        if (cat !== lastCat) {
          data.push({ type: 'header', title: cat, emoji: '📦', key: `h-cat-${cat}` });
          lastCat = cat;
        }
        data.push(item);
      }
    } else {
      // default or name sort
      if (autoAdded.length > 0) {
        data.push({ type: 'header', title: 'הוספה אוטומטית', emoji: '✨', key: 'h-auto' });
        data.push(...sortItems(autoAdded));
      }
      if (manual.length > 0) {
        data.push({ type: 'header', title: 'הוספה ידנית', emoji: '✏️', key: 'h-manual' });
        data.push(...sortItems(manual));
      }
    }

    if (purchased.length > 0) {
      data.push({ type: 'header', title: `נרכשו (${purchased.length})`, emoji: '✓', key: 'h-purchased' });
      if (showPurchased) {
        data.push(...sortItems(purchased));
      }
    }

    return data;
  }, [autoAdded, manual, purchased, showPurchased, sortMode]);

  // ── Guards ─────────────────────────────────────────────────
  // Auth is enforced at root layout level via Redirect.
  // Here we only guard against loading states.
  if (authLoading || isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={dark.accent} />
      </View>
    );
  }

  if (!user) {
    return null; // Root layout will redirect to /auth
  }

  // Guard: household_id is required — the auth trigger may not have run
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

  // ── Main UI ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Suggestion chips (horizontal) */}
      <SuggestionChips
        suggestions={suggestions}
        onAccept={handleAcceptSuggestion}
      />

      {/* Sort toggle */}
      <View style={styles.sortBar}>
        <TouchableOpacity
          style={[styles.sortBtn, sortMode === 'default' && styles.sortBtnActive]}
          onPress={() => setSortMode('default')}
        >
          <Text style={[styles.sortBtnText, sortMode === 'default' && styles.sortBtnTextActive]}>ברירת מחדל</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortBtn, sortMode === 'name' && styles.sortBtnActive]}
          onPress={() => setSortMode('name')}
        >
          <Text style={[styles.sortBtnText, sortMode === 'name' && styles.sortBtnTextActive]}>לפי שם</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortBtn, sortMode === 'category' && styles.sortBtnActive]}
          onPress={() => setSortMode('category')}
        >
          <Text style={[styles.sortBtnText, sortMode === 'category' && styles.sortBtnTextActive]}>לפי קטגוריה</Text>
        </TouchableOpacity>
      </View>

      {/* Shopping list with section headers */}
      <FlatList
        data={listData}
        keyExtractor={(row) => ('type' in row ? row.key : row.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item: row }) => {
          if ('type' in row) {
            // Purchased section header is tappable to toggle
            if (row.key === 'h-purchased') {
              return (
                <TouchableOpacity
                  style={styles.sectionHeader}
                  onPress={() => setShowPurchased((v) => !v)}
                  activeOpacity={0.7}
                >
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>
                      {row.emoji} {row.title}
                    </Text>
                    <Text style={styles.toggleArrow}>
                      {showPurchased ? '▲' : '▼'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {row.emoji} {row.title}
                </Text>
              </View>
            );
          }
          return renderItem({ item: row });
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🛒</Text>
            <Text style={styles.emptyText}>הרשימה ריקה!</Text>
            <Text style={styles.emptySubtext}>לחצו + כדי להוסיף מוצר</Text>
          </View>
        }
      />

      {/* FAB — Add Product (position: end for RTL) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddProduct(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Snooze bottom sheet */}
      <SnoozeSheet
        visible={!!snoozeTarget}
        productName={snoozeTarget?.product?.name ?? ''}
        onSnooze={handleSnooze}
        onRemove={handleRemove}
        onClose={() => setSnoozeTarget(null)}
      />

      {/* Add product modal */}
      <Modal
        visible={showAddProduct}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddProduct(false)}
      >
        <AddProductSheet
          householdId={user.household_id}
          onClose={() => setShowAddProduct(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles (Dark mode, RTL-safe) ──────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: dark.background,
  },
  listContent: {
    paddingBottom: 100,
  },
  sortBar: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: dark.background,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: dark.surfaceAlt,
    borderWidth: 1,
    borderColor: dark.border,
  },
  sortBtnActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  sortBtnText: {
    fontSize: 13,
    color: dark.textSecondary,
    fontWeight: '600',
  },
  sortBtnTextActive: {
    color: '#fff',
  },
  sectionHeader: {
    paddingStart: 16,
    paddingEnd: 16,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: dark.sectionBg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: dark.textSecondary,
    textAlign: 'right',
  },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleArrow: {
    fontSize: 12,
    color: dark.textMuted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: dark.text,
  },
  emptySubtext: {
    fontSize: 14,
    color: dark.textSecondary,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    end: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: dark.fab,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4.65,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
});
