import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/hooks/useAuth';
import type { ShoppingItem } from '@/src/store/shoppingListStore';
import { dark } from '@/constants/theme';

// ── Types ────────────────────────────────────────────────────
type ListRow =
  | ShoppingItem
  | { type: 'header'; title: string; key: string };

type DateFilter = 'all' | 'today' | 'week' | 'month' | 'custom';

function formatDateHebrew(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, today)) return 'היום';
  if (isSameDay(d, yesterday)) return 'אתמול';

  return d.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function HistoryScreen() {
  const { user, isLoading: authLoading } = useAuth();

  const [purchasedItems, setPurchasedItems] = useState<ShoppingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ── Filter items by date ───────────────────────────────────
  const filteredItems = useMemo(() => {
    if (dateFilter === 'all') return purchasedItems;

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
      case 'custom':
        cutoff = new Date(customDate.getFullYear(), customDate.getMonth(), customDate.getDate());
        break;
    }

    return purchasedItems.filter((item) => {
      if (!item.purchased_at) return false;
      return new Date(item.purchased_at) >= cutoff;
    });
  }, [purchasedItems, dateFilter, customDate]);

  // ── Fetch purchased items ──────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!user?.household_id) return;

    const { data, error } = await supabase
      .from('shopping_list')
      .select('*, product:products(*)')
      .eq('household_id', user.household_id)
      .eq('status', 'purchased')
      .order('purchased_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[history] fetch error:', error.message);
    } else {
      setPurchasedItems((data ?? []) as ShoppingItem[]);
    }
  }, [user?.household_id]);

  useEffect(() => {
    if (!user?.household_id) return;
    setIsLoading(true);
    fetchHistory().finally(() => setIsLoading(false));
  }, [user?.household_id, fetchHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }, [fetchHistory]);

  // ── Group by date ──────────────────────────────────────────
  const listData = useMemo<ListRow[]>(() => {
    const groups = new Map<string, ShoppingItem[]>();

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
      const label = items[0]?.purchased_at
        ? formatDateHebrew(items[0].purchased_at)
        : 'לא ידוע';
      flat.push({ type: 'header', title: label, key: `h-${dateKey}` });
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
      {/* Date filter bar */}
      <View style={styles.filterBar}>
        {([
          ['all', 'הכל'],
          ['today', 'היום'],
          ['week', 'שבוע'],
          ['month', 'חודש'],
        ] as [DateFilter, string][]).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterChip, dateFilter === key && styles.filterChipActive]}
            onPress={() => setDateFilter(key)}
          >
            <Text style={[styles.filterChipText, dateFilter === key && styles.filterChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.filterChip, dateFilter === 'custom' && styles.filterChipActive]}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={[styles.filterChipText, dateFilter === 'custom' && styles.filterChipTextActive]}>
            {dateFilter === 'custom'
              ? `📅 ${customDate.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}`
              : '📅 בחר תאריך'}
          </Text>
        </TouchableOpacity>
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
                <Text style={styles.datePickerTitle}>בחר תאריך התחלה</Text>
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
      <FlatList
        data={listData}
        keyExtractor={(row) => ('type' in row ? row.key : row.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item: row }) => {
          if ('type' in row) {
            return (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{row.title}</Text>
              </View>
            );
          }

          const productName = row.product?.name ?? '';
          const category = row.product?.category ?? '';
          const time = row.purchased_at
            ? new Date(row.purchased_at).toLocaleTimeString('he-IL', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : '';

          return (
            <View style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{productName}</Text>
                <View style={styles.itemMeta}>
                  {category !== '' && (
                    <Text style={styles.itemCategory}>{category}</Text>
                  )}
                  {row.quantity > 1 && (
                    <Text style={styles.itemQty}>×{row.quantity}</Text>
                  )}
                  {time !== '' && (
                    <Text style={styles.itemTime}>{time}</Text>
                  )}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyText}>אין היסטוריית רכישות</Text>
            <Text style={styles.emptySubtext}>
              פריטים שתסמנו כנרכשו יופיעו כאן
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ── Styles (Dark mode, RTL-safe) ────────────────────────────
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
    paddingBottom: 40,
  },
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: dark.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.border,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: dark.surfaceAlt,
    borderWidth: 1,
    borderColor: dark.borderLight,
  },
  filterChipActive: {
    backgroundColor: dark.accent,
    borderColor: dark.accent,
  },
  filterChipText: {
    fontSize: 13,
    color: dark.textMuted,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: dark.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 30,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.border,
  },
  datePickerTitle: {
    fontSize: 16,
    fontWeight: '600',
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
  sectionHeader: {
    paddingStart: 16,
    paddingEnd: 16,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: dark.sectionBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: dark.textSecondary,
    textAlign: 'right',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingStart: 16,
    paddingEnd: 16,
    backgroundColor: dark.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.border,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    color: dark.text,
    textAlign: 'right',
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  itemCategory: {
    fontSize: 12,
    color: dark.textSecondary,
    textAlign: 'right',
  },
  itemQty: {
    fontSize: 12,
    color: dark.accent,
    fontWeight: '600',
  },
  itemTime: {
    fontSize: 12,
    color: dark.textMuted,
  },
  emptyContainer: {
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
});
