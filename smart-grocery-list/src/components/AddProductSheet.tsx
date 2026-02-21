import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useShoppingListStore } from '../store/shoppingListStore';
import type { Database } from '../types/database';

type ProductRow = Database['public']['Tables']['products']['Row'];

interface AddProductSheetProps {
  householdId: string;
  onClose: () => void;
}

export function AddProductSheet({ householdId, onClose }: AddProductSheetProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const addItem = useShoppingListStore((s) => s.addItem);

  // ── Debounced search (300 ms) ──────────────────────────────
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase
        .from('products')
        .select('*')
        .ilike('name', `%${query}%`)
        .limit(15);

      setResults(data ?? []);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback(
    async (product: ProductRow) => {
      await addItem(product.id, householdId);
      onClose();
    },
    [addItem, householdId, onClose],
  );

  const handleCreateCustom = useCallback(async () => {
    if (query.trim().length === 0) return;

    const { data: newProduct, error } = await supabase
      .from('products')
      .insert({
        name: query.trim(),
        is_custom: true,
        created_by_household: householdId,
      })
      .select()
      .single();

    if (error || !newProduct) {
      console.error('[AddProduct] create error:', error?.message);
      return;
    }

    await addItem(newProduct.id, householdId);
    onClose();
  }, [query, householdId, addItem, onClose]);

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
        placeholder="חפש מוצר..."
        placeholderTextColor="#aaa"
        value={query}
        onChangeText={setQuery}
        autoFocus
      />

      {isSearching && <Text style={styles.searching}>מחפש...</Text>}

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
            <Text style={styles.resultName}>{item.name}</Text>
            {item.category && (
              <Text style={styles.resultCat}>{item.category}</Text>
            )}
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
    backgroundColor: '#fff',
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: 16,
    paddingEnd: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
  },
  closeBtn: {
    fontSize: 20,
    color: '#999',
  },
  input: {
    marginStart: 16,
    marginEnd: 16,
    marginVertical: 16,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searching: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginBottom: 8,
  },
  list: {
    flex: 1,
    paddingStart: 16,
    paddingEnd: 16,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  resultName: {
    fontSize: 16,
    color: '#222',
  },
  resultCat: {
    fontSize: 13,
    color: '#888',
  },
  createBtn: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 20,
  },
  createBtnText: {
    fontSize: 15,
    color: '#2e7d32',
    fontWeight: '600',
  },
});
