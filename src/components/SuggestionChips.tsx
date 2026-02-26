import React, { useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { SuggestionItem } from '../store/shoppingListStore';
import { AI_SUGGESTION_CONFIG } from '../store/shoppingListStore';
import { dark } from '@/constants/theme';

interface SuggestionChipsProps {
  suggestions: SuggestionItem[];
  onAccept: (suggestion: SuggestionItem) => void;
}

export function SuggestionChips({ suggestions, onAccept }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  // Split: urgent items (overdue / due today) vs regular suggestions
  const { urgentItems, regularItems } = useMemo(() => {
    const urgent: SuggestionItem[] = [];
    const regular: SuggestionItem[] = [];
    for (const s of suggestions) {
      if (
        s.daysUntilNextBuy !== null &&
        s.daysUntilNextBuy <= AI_SUGGESTION_CONFIG.urgentWithinDays
      ) {
        urgent.push(s);
      } else {
        regular.push(s);
      }
    }
    return { urgentItems: urgent, regularItems: regular };
  }, [suggestions]);

  return (
    <View style={styles.container}>
      {/* ── Urgent items line (overdue / due today) ── */}
      {urgentItems.length > 0 && (
        <View style={styles.urgentSection}>
          <Text style={styles.urgentHeader}>⚠️ כדאי לקנות היום</Text>
          <FlatList
            horizontal
            inverted={false}
            showsHorizontalScrollIndicator={false}
            data={urgentItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const overdueDays =
                item.daysUntilNextBuy !== null && item.daysUntilNextBuy < 0
                  ? Math.abs(item.daysUntilNextBuy)
                  : 0;
              return (
                <TouchableOpacity
                  style={styles.urgentChip}
                  onPress={() => onAccept(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.chipContent}>
                    <Text style={styles.urgentChipText}>
                      {item.product.name}
                    </Text>
                    <Text style={styles.confidenceBadgeUrgent}>
                      {item.confidenceScore}%
                    </Text>
                  </View>
                  {overdueDays > 0 && (
                    <Text style={styles.overdueLabel}>
                      איחור {overdueDays} {overdueDays === 1 ? 'יום' : 'ימים'}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* ── Regular suggestion chips ── */}
      {regularItems.length > 0 && (
        <>
          <Text style={styles.header}>הצעות AI חכמות</Text>
          <FlatList
            horizontal
            inverted={false}
            showsHorizontalScrollIndicator={false}
            data={regularItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.chip}
                onPress={() => onAccept(item)}
                activeOpacity={0.7}
              >
                <View style={styles.chipContent}>
                  <Text style={styles.chipText}>{item.product.name}</Text>
                  <Text style={styles.confidenceBadge}>
                    {item.confidenceScore}%
                  </Text>
                </View>
                <Text style={styles.plusIcon}>+</Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </View>
  );
}

// ── Styles (Dark mode, RTL-safe) ─────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
    backgroundColor: dark.background,
  },
  // ── Urgent section ─────────────────────────────────────────
  urgentSection: {
    marginBottom: 10,
  },
  urgentHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: dark.warning,
    paddingStart: 16,
    paddingEnd: 16,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  urgentChip: {
    backgroundColor: dark.warningBg,
    borderRadius: 22,
    paddingVertical: 8,
    paddingStart: 14,
    paddingEnd: 14,
    borderWidth: 1.5,
    borderColor: dark.warning,
    gap: 2,
  },
  urgentChipText: {
    fontSize: 14,
    color: dark.warning,
    fontWeight: '700',
  },
  confidenceBadgeUrgent: {
    fontSize: 11,
    fontWeight: '800',
    color: dark.warning,
    opacity: 0.8,
    marginStart: 6,
  },
  overdueLabel: {
    fontSize: 10,
    color: dark.error,
    fontWeight: '600',
    marginTop: 1,
  },
  // ── Regular section ────────────────────────────────────────
  header: {
    fontSize: 13,
    fontWeight: '800',
    color: dark.secondary,
    paddingStart: 16,
    paddingEnd: 16,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingStart: 14,
    paddingEnd: 14,
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.chip,
    borderRadius: 22,
    paddingVertical: 9,
    paddingStart: 16,
    paddingEnd: 14,
    borderWidth: 1.5,
    borderColor: dark.chipBorder,
    gap: 8,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipText: {
    fontSize: 14,
    color: dark.chipText,
    fontWeight: '500',
  },
  confidenceBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: dark.secondary,
    opacity: 0.85,
  },
  plusIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: dark.secondary,
  },
});
