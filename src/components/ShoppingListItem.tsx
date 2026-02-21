import React, { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import type { ShoppingItem } from '../store/shoppingListStore';

interface ShoppingListItemProps {
  item: ShoppingItem;
  isPending: boolean; // true during the 5 s undo window
  onCheckOff: (itemId: string) => void;
  onUndo: (itemId: string) => void;
  onSwipe: (itemId: string) => void;
}

export function ShoppingListItem({
  item,
  isPending,
  onCheckOff,
  onUndo,
  onSwipe,
}: ShoppingListItemProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const isPurchased = item.status === 'purchased';
  const productName = item.product?.name ?? '';
  const category = item.product?.category ?? '';

  // ── Swipe action (revealed after threshold) ────────────────
  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity
        style={styles.swipeAction}
        onPress={() => {
          onSwipe(item.id);
          swipeableRef.current?.close();
        }}
        activeOpacity={0.8}
      >
        <Animated.Text style={[styles.swipeEmoji, { transform: [{ scale }] }]}>
          ⏰
        </Animated.Text>
        <Text style={styles.swipeLabel}>דחייה</Text>
      </TouchableOpacity>
    );
  };

  // ── Inner content ──────────────────────────────────────────
  const content = (
    <View style={[styles.container, isPurchased && styles.purchasedBg]}>
      {/* Circular checkbox */}
      <TouchableOpacity
        style={[styles.checkbox, isPurchased && styles.checkboxChecked]}
        onPress={() => {
          if (isPurchased && isPending) {
            onUndo(item.id);
          } else if (!isPurchased) {
            onCheckOff(item.id);
          }
        }}
        activeOpacity={0.6}
      >
        {isPurchased && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      {/* Product info */}
      <View style={styles.info}>
        <Text style={[styles.name, isPurchased && styles.nameStruck]}>
          {productName}
        </Text>
        {(category !== '' || item.quantity > 1) && (
          <View style={styles.meta}>
            {category !== '' && <Text style={styles.category}>{category}</Text>}
            {item.quantity > 1 && (
              <Text style={styles.qty}>×{item.quantity}</Text>
            )}
          </View>
        )}
      </View>

      {/* Undo button (visible only during the 5 s debounce window) */}
      {isPurchased && isPending && (
        <TouchableOpacity style={styles.undoBtn} onPress={() => onUndo(item.id)}>
          <Text style={styles.undoText}>ביטול</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Purchased items are not swipeable
  if (isPurchased) return content;

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      rightThreshold={40}
      onSwipeableOpen={() => {
        onSwipe(item.id);
        swipeableRef.current?.close();
      }}
    >
      {content}
    </Swipeable>
  );
}

// ── Styles (RTL-safe: marginStart/End, paddingStart/End) ─────
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingStart: 16,
    paddingEnd: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  purchasedBg: {
    backgroundColor: '#f9fdf9',
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4caf50',
    borderColor: '#4caf50',
  },
  checkmark: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    color: '#222',
  },
  nameStruck: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  meta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  category: {
    fontSize: 12,
    color: '#888',
  },
  qty: {
    fontSize: 12,
    color: '#2f95dc',
    fontWeight: '600',
  },
  undoBtn: {
    paddingStart: 12,
    paddingEnd: 12,
    paddingVertical: 6,
    backgroundColor: '#fff3e0',
    borderRadius: 12,
  },
  undoText: {
    fontSize: 13,
    color: '#e65100',
    fontWeight: '600',
  },
  // ── Swipe action (orange strip) ────────────────────────────
  swipeAction: {
    backgroundColor: '#ff9800',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  swipeEmoji: {
    fontSize: 24,
  },
  swipeLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
});
