import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { SuggestionItem } from '../store/shoppingListStore';

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

// ── Styles (RTL-safe) ────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  header: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    paddingStart: 16,
    paddingEnd: 16,
    marginBottom: 8,
  },
  listContent: {
    paddingStart: 12,
    paddingEnd: 12,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f4ff',
    borderRadius: 20,
    paddingVertical: 8,
    paddingStart: 14,
    paddingEnd: 14,
    borderWidth: 1,
    borderColor: '#d0d8f0',
    gap: 6,
  },
  chipText: {
    fontSize: 14,
    color: '#333',
  },
  plusIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2f95dc',
  },
});
