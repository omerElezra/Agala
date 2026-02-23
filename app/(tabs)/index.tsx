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
type SortMode = 'name' | 'category';

// ── Category → emoji mapping for sort-by-category headers ────
const CATEGORY_EMOJI: Record<string, string> = {
  // ── New categories (Shufersal / Rami Levy style) ──
  'פירות וירקות': '🥬',
  'חלב וביצים': '🥛',
  'בשר, עוף ודגים': '🥩',
  'לחם ומאפים': '🍞',
  'שתייה': '🥤',
  'יין ואלכוהול': '🍷',
  'חטיפים, ממתקים ודגנים': '🍫',
  'שימורים, רטבים וממרחים': '🥫',
  'תבלינים, אפייה ושמנים': '🧂',
  'פסטה, אורז וקטניות': '🍝',
  'ניקיון וחד פעמי': '🧹',
  'טיפוח והיגיינה': '🧴',
  'תינוקות': '🍼',
  'קפואים': '🧊',
  'בריאות ואורגני': '🌿',
  'ארוחות מוכנות': '🥘',
  'ללא קטגוריה': '📦',
  // ── Legacy fallbacks for existing products ──
  'מוצרי חלב וביצים': '🥛',
  'בשר ועוף': '🍗',
  'דגים ופירות ים': '🐟',
  'משקאות': '🥤',
  'חטיפים וממתקים': '🍫',
  'שימורים ורטבים': '🥫',
  'תבלינים ושמנים': '🧂',
  'דגנים, אורז ופסטה': '🍚',
  'מוצרי ניקיון': '🧹',
  'טיפוח אישי': '🧴',
  'מוצרים לתינוקות וילדים': '🍼',
  'מזון קפוא': '🧊',
  'מזון בריאות ואורגני': '🌿',
  'מזון מוכן וארוחות': '🥘',
  'ממתקים ואפייה': '🎂',
};
type SortDirection = 'asc' | 'desc';
type ListRow =
  | ShoppingItem
  | { type: 'header'; title: string; emoji: string; key: string };

export default function HomeScreen() {
  const { user, isLoading: authLoading } = useAuth();

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

  const [snoozeTarget, setSnoozeTarget] = useState<ShoppingItem | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showPurchased, setShowPurchased] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const handleSortPress = useCallback((mode: SortMode) => {
    if (sortMode === mode) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortMode(mode);
      setSortDir('asc');
    }
  }, [sortMode]);

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
        onCheckOff={checkOffItem}
        onSwipe={handleSwipe}
      />
    ),
    [checkOffItem, handleSwipe],
  );

  // ── Build flat list data with section headers ──────────────
  const listData = useMemo<ListRow[]>(() => {
    const data: ListRow[] = [];

    const dir = sortDir === 'asc' ? 1 : -1;

    // Helper: sort items by the current mode + direction
    const sortItems = (arr: ShoppingItem[]): ShoppingItem[] => {
      if (sortMode === 'name') {
        return [...arr].sort((a, b) =>
          dir * (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'he'),
        );
      }
      if (sortMode === 'category') {
        return [...arr].sort((a, b) => {
          const catA = a.product?.category ?? 'ללא קטגוריה';
          const catB = b.product?.category ?? 'ללא קטגוריה';
          const catCmp = catA.localeCompare(catB, 'he');
          if (catCmp !== 0) return dir * catCmp;
          return dir * (a.product?.name ?? '').localeCompare(b.product?.name ?? '', 'he');
        });
      }
      return arr;
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
          data.push({ type: 'header', title: cat, emoji: CATEGORY_EMOJI[cat] ?? '📦', key: `h-cat-${cat}` });
          lastCat = cat;
        }
        data.push(item);
      }
    } else {
      // name sort
      if (autoAdded.length > 0) {
        data.push({ type: 'header', title: 'הוספה אוטומטית', emoji: '✨', key: 'h-auto' });
        data.push(...sortItems(autoAdded));
      }
      if (manual.length > 0) {
        data.push({ type: 'header', title: `רשימת הקניות (${manual.length})`, emoji: '🛒', key: 'h-manual' });
        data.push(...sortItems(manual));
      }
    }

    if (purchased.length > 0) {
      data.push({ type: 'header', title: `כל המוצרים (${purchased.length})`, emoji: '✅', key: 'h-purchased' });
      if (showPurchased) {
        data.push(...sortItems(purchased));
      }
    }

    return data;
  }, [autoAdded, manual, purchased, showPurchased, sortMode, sortDir]);

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
        {([['name', 'לפי שם'], ['category', 'לפי קטגוריה']] as [SortMode, string][]).map(([mode, label]) => {
          const isActive = sortMode === mode;
          const arrow = isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.sortBtn, isActive && styles.sortBtnActive]}
              onPress={() => handleSortPress(mode)}
            >
              <Text style={[styles.sortBtnText, isActive && styles.sortBtnTextActive]}>
                {label}{arrow}
              </Text>
            </TouchableOpacity>
          );
        })}
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
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: dark.background,
  },
  sortBtn: {
    paddingHorizontal: 24,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: dark.surfaceAlt,
    borderWidth: 1.5,
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
    fontWeight: '700',
  },
  sectionHeader: {
    paddingStart: 16,
    paddingEnd: 16,
    paddingTop: 18,
    paddingBottom: 6,
    backgroundColor: dark.sectionBg,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: dark.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
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
    fontSize: 56,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: dark.text,
  },
  emptySubtext: {
    fontSize: 14,
    color: dark.textSecondary,
    marginTop: 6,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    end: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: dark.fab,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: dark.fabShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  fabText: {
    fontSize: 30,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
});
