import React, { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { dark } from '@/constants/theme';
import type { ShoppingItem } from '../store/shoppingListStore';
import { useShoppingListStore } from '../store/shoppingListStore';

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
  const router = useRouter();
  const updateQuantity = useShoppingListStore((s) => s.updateQuantity);
  const reactivateItem = useShoppingListStore((s) => s.reactivateItem);
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
          } else if (isPurchased) {
            reactivateItem(item.id);
          } else {
            onCheckOff(item.id);
          }
        }}
        activeOpacity={0.6}
      >
        {isPurchased && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      {/* Quantity +/- controls (only for active items) */}
      {!isPurchased && (
        <View style={styles.qtyControls}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => updateQuantity(item.id, item.quantity - 1)}
            activeOpacity={0.6}
            disabled={item.quantity <= 1}
          >
            <Text style={[styles.qtyBtnText, item.quantity <= 1 && styles.qtyBtnDisabled]}>−</Text>
          </TouchableOpacity>
          <Text style={styles.qtyValue}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => updateQuantity(item.id, item.quantity + 1)}
            activeOpacity={0.6}
          >
            <Text style={styles.qtyBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Product info — tap to open detail page */}
      <TouchableOpacity
        style={styles.info}
        onPress={() => router.push(`/item/${item.id}`)}
        activeOpacity={0.7}
      >
        <Text style={[styles.name, isPurchased && styles.nameStruck]}>
          {productName}
        </Text>
        {category !== '' && (
          <View style={styles.meta}>
            <Text style={styles.category}>{category}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Undo button (visible only during the 5 s debounce window) */}
      {isPurchased && isPending && (
        <TouchableOpacity style={styles.undoBtn} onPress={() => onUndo(item.id)}>
          <Text style={styles.undoText}>ביטול</Text>
        </TouchableOpacity>
      )}

      {/* Show quantity badge for purchased items */}
      {isPurchased && item.quantity > 1 && (
        <Text style={styles.purchasedQty}>×{item.quantity}</Text>
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

// ── Styles (Dark mode, RTL-safe) ─────────────────────────────
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingStart: 16,
    paddingEnd: 16,
    backgroundColor: dark.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.border,
  },
  purchasedBg: {
    backgroundColor: dark.successBg,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: dark.checkbox,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: 12,
  },
  checkboxChecked: {
    backgroundColor: dark.checkboxChecked,
    borderColor: dark.checkboxChecked,
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
    color: dark.text,
    textAlign: 'right',
  },
  nameStruck: {
    textDecorationLine: 'line-through',
    color: dark.textMuted,
  },
  meta: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  category: {
    fontSize: 12,
    color: dark.textSecondary,
    textAlign: 'right',
  },
  qty: {
    fontSize: 12,
    color: dark.accent,
    fontWeight: '600',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surfaceAlt,
    borderRadius: 8,
    marginEnd: 10,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: {
    fontSize: 18,
    color: dark.accent,
    fontWeight: '700',
    lineHeight: 22,
  },
  qtyBtnDisabled: {
    color: dark.textMuted,
  },
  qtyValue: {
    fontSize: 14,
    color: dark.text,
    fontWeight: '700',
    minWidth: 22,
    textAlign: 'center',
  },
  purchasedQty: {
    fontSize: 13,
    color: dark.textSecondary,
    fontWeight: '600',
    marginStart: 8,
  },
  undoBtn: {
    paddingStart: 12,
    paddingEnd: 12,
    paddingVertical: 6,
    backgroundColor: dark.warningBg,
    borderRadius: 12,
  },
  undoText: {
    fontSize: 13,
    color: dark.warning,
    fontWeight: '600',
    textAlign: 'right',
  },
  // ── Swipe action ──────────────────────────────────────────
  swipeAction: {
    backgroundColor: dark.swipeOrange,
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
