import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { SuggestionChips } from '@/src/components/SuggestionChips';
import { ShoppingListItem } from '@/src/components/ShoppingListItem';
import { SnoozeSheet } from '@/src/components/SnoozeSheet';
import { AddProductSheet } from '@/src/components/AddProductSheet';

// ── FlatList union type (section headers mixed with items) ────
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

  // ── Bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    if (!user?.household_id) return;

    fetchList(user.household_id);
    const unsub = subscribeRealtime(user.household_id);
    flushOfflineQueue();

    return unsub;
  }, [user?.household_id, fetchList, subscribeRealtime, flushOfflineQueue]);

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

    if (autoAdded.length > 0) {
      data.push({ type: 'header', title: 'הוספה אוטומטית', emoji: '✨', key: 'h-auto' });
      data.push(...autoAdded);
    }
    if (manual.length > 0) {
      data.push({ type: 'header', title: 'הוספה ידנית', emoji: '✏️', key: 'h-manual' });
      data.push(...manual);
    }
    if (purchased.length > 0) {
      data.push({ type: 'header', title: 'נרכשו', emoji: '✓', key: 'h-purchased' });
      data.push(...purchased);
    }

    return data;
  }, [autoAdded, manual, purchased]);

  // ── Guards ─────────────────────────────────────────────────
  // Auth is enforced at root layout level via Redirect.
  // Here we only guard against loading states.
  if (authLoading || isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2f95dc" />
      </View>
    );
  }

  if (!user) {
    return null; // Root layout will redirect to /auth
  }

  // ── Main UI ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Suggestion chips (horizontal) */}
      <SuggestionChips
        suggestions={suggestions}
        onAccept={handleAcceptSuggestion}
      />

      {/* Shopping list with section headers */}
      <FlatList
        data={listData}
        keyExtractor={(row) => ('type' in row ? row.key : row.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: row }) => {
          if ('type' in row) {
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

// ── Styles (RTL-safe: start/end, no left/right) ──────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  listContent: {
    paddingBottom: 100,
  },
  sectionHeader: {
    paddingStart: 16,
    paddingEnd: 16,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: '#fafafa',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
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
    color: '#555',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    end: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.27,
    shadowRadius: 4.65,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
    marginTop: -2,
  },
});
