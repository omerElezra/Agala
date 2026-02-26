import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/hooks/useAuth';
import { useShoppingListStore } from '@/src/store/shoppingListStore';
import { dark } from '@/constants/theme';
import type { Database } from '@/src/types/database';

// ── Types ────────────────────────────────────────────────────
type ProductRow = Database['public']['Tables']['products']['Row'];

/** A single purchase transaction from purchase_history */
interface PurchaseTransaction {
  id: string;
  household_id: string;
  product_id: string;
  quantity: number;
  purchased_at: string;
  product: ProductRow | null;
}

type ListRow =
  | PurchaseTransaction
  | { type: 'header'; title: string; isToday: boolean; count: number; key: string };

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom';

function formatDateHebrew(dateStr: string): { label: string; isToday: boolean } {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, today)) {
    return {
      label: `היום, ${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`,
      isToday: true,
    };
  }
  if (isSameDay(d, yesterday)) {
    return {
      label: `אתמול, ${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })}`,
      isToday: false,
    };
  }

  return {
    label: d.toLocaleDateString('he-IL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    isToday: false,
  };
}

export default function HistoryScreen() {
  const { user, isLoading: authLoading } = useAuth();

  const [transactions, setTransactions] = useState<PurchaseTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [deletedItemId, setDeletedItemId] = useState<string | null>(null);

  // ── Filter items by date ───────────────────────────────────
  const filteredItems = useMemo(() => {
    if (dateFilter === 'all') return transactions;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let cutoff: Date;
    switch (dateFilter) {
      case 'today':
        cutoff = startOfToday;
        break;
      case 'week':
        cutoff = new Date(startOfToday);
        cutoff.setDate(cutoff.getDate() - 7);
        break;
      case 'month':
        cutoff = new Date(startOfToday);
        cutoff.setMonth(cutoff.getMonth() - 1);
        break;
      case 'custom': {
        const start = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate());
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return transactions.filter((item) => {
          if (!item.purchased_at) return false;
          const d = new Date(item.purchased_at);
          return d >= start && d < end;
        });
      }
    }

    return transactions.filter((item) => {
      if (!item.purchased_at) return false;
      return new Date(item.purchased_at) >= cutoff;
    });
  }, [transactions, dateFilter, customDate]);

  // ── Fetch purchase history (transaction log) ────────────────
  const fetchHistory = useCallback(async () => {
    if (!user?.household_id) return;

    const { data, error } = await supabase
      .from('purchase_history')
      .select('*, product:products(*)')
      .eq('household_id', user.household_id)
      .order('purchased_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[history] fetch error:', error.message);
    } else {
      setTransactions((data ?? []) as PurchaseTransaction[]);
    }
  }, [user?.household_id]);

  // ── Delete a purchase history record ───────────────────────
  const handleDeleteTransaction = useCallback(async (id: string) => {
    // Optimistic: remove from local state
    setTransactions((prev) => prev.filter((t) => t.id !== id));

    const { error } = await supabase
      .from('purchase_history')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[history] delete error:', error.message);
      // Re-fetch to restore on failure
      fetchHistory();
    }
  }, [fetchHistory]);

  useEffect(() => {
    if (!user?.household_id) return;
    setIsLoading(true);
    fetchHistory().finally(() => setIsLoading(false));
  }, [user?.household_id, fetchHistory]);

  // Re-fetch whenever this tab gains focus (so newly purchased items appear)
  useFocusEffect(
    useCallback(() => {
      if (user?.household_id) {
        fetchHistory();
      }
    }, [user?.household_id, fetchHistory])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  // ── Group by date ──────────────────────────────────────────
  const listData = useMemo<ListRow[]>(() => {
    const groups = new Map<string, PurchaseTransaction[]>();

    for (const item of filteredItems) {
      const dateKey = item.purchased_at
        ? new Date(item.purchased_at).toDateString()
        : 'unknown';
      const group = groups.get(dateKey) ?? [];
      group.push(item);
      groups.set(dateKey, group);
    }

    const flat: ListRow[] = [];
    for (const [dateKey, items] of groups) {
      const fmt = items[0]?.purchased_at
        ? formatDateHebrew(items[0].purchased_at)
        : { label: 'לא ידוע', isToday: false };
      flat.push({
        type: 'header',
        title: fmt.label,
        isToday: fmt.isToday,
        count: items.length,
        key: `h-${dateKey}`,
      });
      flat.push(...items);
    }

    return flat;
  }, [filteredItems]);

  // ── Guards ─────────────────────────────────────────────────
  if (authLoading || isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={dark.accent} />
      </View>
    );
  }

  if (!user) return null;

  // ── Main UI ────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* ── Sticky header ─────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>היסטוריית רכישות</Text>

        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {([
            ['all', 'הכל'],
            ['today', 'היום'],
            ['week', 'השבוע'],
            ['month', 'החודש'],
          ] as [DateFilter, string][]).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[styles.pill, dateFilter === key && styles.pillActive]}
              onPress={() => setDateFilter(key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, dateFilter === key && styles.pillTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.pill, dateFilter === 'custom' && styles.pillActive]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="calendar-outline"
              size={14}
              color={dateFilter === 'custom' ? '#fff' : dark.textSecondary}
              style={{ marginEnd: 4 }}
            />
            <Text style={[styles.pillText, dateFilter === 'custom' && styles.pillTextActive]}>
              {dateFilter === 'custom'
                ? customDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
                : 'בחר תאריך'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Date picker modal */}
      {showDatePicker && Platform.OS === 'web' && (
        <Modal transparent animationType="fade">
          <TouchableOpacity
            style={styles.datePickerOverlay}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          >
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>בחר תאריך התחלה</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.datePickerDone}>סיום</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.webDateRow}>
                <input
                  type="date"
                  value={customDate.toISOString().split('T')[0]}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e: any) => {
                    const val = e.target.value;
                    if (val) {
                      setCustomDate(new Date(val + 'T00:00:00'));
                      setDateFilter('custom');
                    }
                  }}
                  style={{
                    fontSize: 18,
                    padding: 12,
                    borderRadius: 8,
                    border: `1px solid ${dark.border}`,
                    backgroundColor: dark.surfaceAlt,
                    color: dark.text,
                    width: '100%',
                    textAlign: 'center',
                  }}
                />
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      {showDatePicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade">
          <TouchableOpacity
            style={styles.datePickerOverlay}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          >
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>בחר יום</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.datePickerDone}>סיום</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={customDate}
                mode="date"
                display="spinner"
                maximumDate={new Date()}
                onChange={(event: DateTimePickerEvent, date?: Date) => {
                  if (date) {
                    setCustomDate(date);
                    setDateFilter('custom');
                  }
                }}
                textColor={dark.text}
              />
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={customDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(event: DateTimePickerEvent, date?: Date) => {
            setShowDatePicker(false);
            if (event.type === 'set' && date) {
              setCustomDate(date);
              setDateFilter('custom');
            }
          }}
        />
      )}

      {/* ── List ──────────────────────────────────────────── */}
      <FlatList
        data={listData}
        keyExtractor={(row) => ('type' in row ? row.key : row.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={dark.accent} />
        }
        renderItem={({ item: row }) => {
          // ── Date group header ──
          if ('type' in row) {
            return (
              <View style={styles.sectionHeader}>
                <Ionicons
                  name={row.isToday ? 'today-outline' : 'calendar-outline'}
                  size={15}
                  color={row.isToday ? dark.accent : dark.textSecondary}
                />
                <Text style={[styles.sectionTitle, row.isToday && styles.sectionTitleToday]}>
                  {row.title}
                </Text>
                <View style={styles.sectionBadge}>
                  <Text style={styles.sectionBadgeText}>{row.count}</Text>
                </View>
              </View>
            );
          }

          // ── Purchase item card ──
          const productName = row.product?.name ?? '';
          const category = row.product?.category ?? 'ללא קטגוריה';
          const time = row.purchased_at
            ? new Date(row.purchased_at).toLocaleTimeString('he-IL', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';

          const isAdded = addedItemId === row.id;
          const isDeleted = deletedItemId === row.id;

          return (
            <View style={styles.itemCard}>
              <View style={[styles.itemCardInner, isDeleted && styles.itemCardDeleted]}>
                {/* Delete button */}
                <TouchableOpacity
                  style={[styles.deleteBtn, isDeleted && styles.deleteBtnDeleted]}
                  onPress={() => {
                    const doDelete = () => {
                      setDeletedItemId(row.id);
                      setTimeout(() => {
                        handleDeleteTransaction(row.id);
                        setDeletedItemId((prev) => (prev === row.id ? null : prev));
                      }, 800);
                    };
                    if (Platform.OS === 'web') {
                      if (window.confirm(`למחוק את "${productName}" מהיסטוריית הרכישות?\n\nשים לב: מחיקה תשפיע על חיזוי הקנייה הבאה.`)) {
                        doDelete();
                      }
                    } else {
                      Alert.alert(
                        `🗑️ מחיקת ${productName}`,
                        `האם למחוק את "${productName}" מהיסטוריית הרכישות?\n\nשים לב: מחיקה תשפיע על חיזוי הקנייה הבאה.`,
                        [
                          { text: 'לא, השאר', style: 'cancel' },
                          { text: 'כן, מחק', style: 'destructive', onPress: doDelete },
                        ],
                      );
                    }
                  }}
                  activeOpacity={0.6}
                >
                  <Ionicons
                    name={isDeleted ? 'close-circle' : 'trash-outline'}
                    size={isDeleted ? 18 : 16}
                    color={isDeleted ? '#fff' : dark.textMuted}
                  />
                </TouchableOpacity>

                {/* Info */}
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {productName}
                    {row.quantity > 1 && (
                      <Text style={styles.itemQty}>{` ×${row.quantity}`}</Text>
                    )}
                  </Text>
                  <Text style={[styles.itemMeta, isDeleted && styles.itemMetaDeleted]} numberOfLines={1}>
                    {isDeleted
                      ? '🗑️ נמחק מההיסטוריה...'
                      : isAdded
                        ? '✓ נוסף לעגלה'
                        : [category, time].filter(Boolean).join(' • ')}
                  </Text>
                </View>

                {/* Add-to-cart icon button */}
                <TouchableOpacity
                  style={[styles.addCartBtn, isAdded && styles.addCartBtnAdded]}
                  onPress={() => {
                    if (!row.product_id || !user?.household_id) return;
                    const result = useShoppingListStore.getState().addItem(
                      row.product_id,
                      user.household_id,
                      row.quantity,
                      row.product,
                    );
                    setAddedItemId(row.id);
                    setTimeout(() => setAddedItemId((prev) => (prev === row.id ? null : prev)), 1500);
                    if (result === 'exists' && Platform.OS !== 'web') {
                      Alert.alert('כבר ברשימה', `${productName} כבר נמצא ברשימה`);
                    }
                  }}
                  activeOpacity={0.6}
                >
                  <Ionicons
                    name={isAdded ? 'checkmark-circle' : 'cart-outline'}
                    size={18}
                    color={isAdded ? '#fff' : dark.accent}
                  />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={56} color={dark.textMuted} />
            <Text style={styles.emptyText}>אין היסטוריית רכישות</Text>
            <Text style={styles.emptySubtext}>
              כל רכישה שתבצעו תירשם כאן
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────
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

  // ── Header ──────────────────────────────────────────────────
  header: {
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 20,
    backgroundColor: dark.background,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: dark.text,
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.border,
  },
  pillActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  pillText: {
    fontSize: 13,
    color: dark.textSecondary,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // ── Date picker ─────────────────────────────────────────────
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: dark.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
  },
  datePickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: dark.text,
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: '700',
    color: dark.accent,
  },
  webDateRow: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },

  // ── List ────────────────────────────────────────────────────
  listContent: {
    paddingBottom: 90,
  },

  // ── Section header ──────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: dark.textSecondary,
    letterSpacing: 0.3,
  },
  sectionTitleToday: {
    color: dark.accent,
  },
  sectionBadge: {
    backgroundColor: dark.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
    marginStart: 2,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: dark.textMuted,
  },

  // ── Item card ───────────────────────────────────────────────
  itemCard: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  itemCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: dark.border,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: dark.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 10,
  },
  deleteBtnDeleted: {
    backgroundColor: '#e74c3c',
  },
  itemCardDeleted: {
    opacity: 0.6,
    borderColor: 'rgba(231,76,60,0.4)',
  },
  itemMetaDeleted: {
    color: '#e74c3c',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: dark.text,
    lineHeight: 18,
  },
  itemQty: {
    fontSize: 13,
    color: dark.accent,
    fontWeight: '800',
  },
  itemMeta: {
    fontSize: 11,
    color: dark.textSecondary,
    marginTop: 2,
  },
  addCartBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(139,159,232,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: 8,
  },
  addCartBtnAdded: {
    backgroundColor: dark.success,
  },

  // ── Empty state ─────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    gap: 8,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: dark.text,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: dark.textSecondary,
  },
});
