import React, { useCallback, useRef, useState } from 'react';
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
  onCheckOff: (itemId: string) => void;
  onSwipe: (itemId: string) => void;
}

export function ShoppingListItem({
  item,
  onCheckOff,
  onSwipe,
}: ShoppingListItemProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const router = useRouter();
  const updateQuantity = useShoppingListStore((s) => s.updateQuantity);
  const reactivateItem = useShoppingListStore((s) => s.reactivateItem);
  const isPurchased = item.status === 'purchased';
  const productName = item.product?.name ?? '';
  const category = item.product?.category ?? '';

  // ── Animated values ────────────────────────────────────────
  const flashAnim = useRef(new Animated.Value(0)).current;   // 0 = normal, 1 = flash
  const [flashing, setFlashing] = useState(false);
  const [reactivateFlashing, setReactivateFlashing] = useState(false);

  // Row bg color interpolation: normal → green flash (active items)
  const rowBgColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [dark.surface, '#2ecc7144'],          // subtle green flash
  });

  // Row bg color interpolation: purchased → accent flash (reactivate)
  const reactivateRowBg = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [dark.purchasedBg, '#8B9FE844'],      // subtle accent flash
  });

  /** Quick green flash → checkOff */
  const animateCheckOff = useCallback(() => {
    setFlashing(true);
    Animated.sequence([
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: false, // need for backgroundColor
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start(() => {
      setFlashing(false);
      flashAnim.setValue(0);
      onCheckOff(item.id);
    });
  }, [item.id, onCheckOff, flashAnim]);

  /** Quick accent flash → reactivate (add back to cart) */
  const animateReactivate = useCallback(() => {
    setReactivateFlashing(true);
    Animated.sequence([
      Animated.timing(flashAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: false,
      }),
      Animated.timing(flashAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start(() => {
      setReactivateFlashing(false);
      flashAnim.setValue(0);
      reactivateItem(item.id);
    });
  }, [item.id, reactivateItem, flashAnim]);

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
    <Animated.View
      style={[
        styles.container,
        isPurchased && !reactivateFlashing && styles.purchasedBg,
        isPurchased && reactivateFlashing && { backgroundColor: reactivateRowBg, opacity: 1 },
        !isPurchased && { backgroundColor: rowBgColor },
      ]}
    >
      {/* Circular checkbox */}
      <TouchableOpacity
        style={[
          styles.checkbox,
          flashing && styles.checkboxFlash,
          reactivateFlashing && styles.checkboxReactivateFlash,
        ]}
        onPress={() => {
          if (isPurchased) {
            animateReactivate();
          } else {
            animateCheckOff();
          }
        }}
        activeOpacity={0.6}
      >
        {isPurchased
          ? <Text style={[styles.checkmark, reactivateFlashing && styles.reactivateCheck]}>+</Text>
          : flashing
            ? <Text style={styles.flashCheck}>✓</Text>
            : null}
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
        <Text style={[styles.name, isPurchased && styles.namePurchased]}>
          {productName}
        </Text>
        {category !== '' && (
          <View style={styles.meta}>
            <Text style={styles.category}>{category}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Show quantity badge for purchased items */}
      {isPurchased && item.quantity > 1 && (
        <Text style={styles.purchasedQty}>×{item.quantity}</Text>
      )}
    </Animated.View>
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
    paddingVertical: 14,
    paddingStart: 16,
    paddingEnd: 16,
    backgroundColor: dark.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: dark.border,
  },
  purchasedBg: {
    backgroundColor: dark.purchasedBg,
    opacity: 0.6,
  },
  checkbox: {
    width: 38,
    height: 28,
    borderRadius: 14,
    borderWidth: 3.5,
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
    color: dark.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  checkboxFlash: {
    borderColor: '#2ecc71',
    backgroundColor: '#2ecc7133',
  },
  checkboxReactivateFlash: {
    borderColor: dark.accent,
    backgroundColor: dark.accent + '33',
  },
  flashCheck: {
    color: '#2ecc71',
    fontSize: 16,
    fontWeight: '800',
  },
  reactivateCheck: {
    color: dark.accent,
    fontSize: 16,
    fontWeight: '800',
  },
  info: {
    flex: 3,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: dark.text,
  },
  namePurchased: {
    color: dark.textOnAccent,
    fontWeight: '400',
    fontStyle: 'italic',
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 3,
  },
  category: {
    fontSize: 12,
    color: dark.textSecondary,
    fontWeight: '500',
  },
  qty: {
    fontSize: 12,
    color: dark.accent,
    fontWeight: '700',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: dark.surfaceAlt,
    borderRadius: 10,
    marginEnd: 10,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
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
    fontSize: 15,
    color: dark.text,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },
  purchasedQty: {
    fontSize: 13,
    color: dark.textSecondary,
    fontWeight: '700',
    marginStart: 8,
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
    fontWeight: '700',
    marginTop: 4,
  },
});
