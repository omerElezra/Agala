import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { SuggestionItem } from '../store/shoppingListStore';
import { dark } from '@/constants/theme';

interface SuggestionChipsProps {
  suggestions: SuggestionItem[];
  onAccept: (suggestion: SuggestionItem) => void;
}

export function SuggestionChips({ suggestions, onAccept }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.header}>הצעות עבורך</Text>
      <FlatList
        horizontal
        inverted={false}
        showsHorizontalScrollIndicator={false}
        data={suggestions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chip}
            onPress={() => onAccept(item)}
            activeOpacity={0.7}
          >
            <Text style={styles.chipText}>{item.product.name}</Text>
            <Text style={styles.plusIcon}>+</Text>
          </TouchableOpacity>
        )}
      />
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
  chipText: {
    fontSize: 14,
    color: dark.chipText,
    fontWeight: '500',
  },
  plusIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: dark.secondary,
  },
});
