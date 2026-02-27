import { dark } from "@/constants/theme";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import type { ShoppingItem } from "../store/shoppingListStore";
import { useShoppingListStore } from "../store/shoppingListStore";

interface ShoppingListItemProps {
  item: ShoppingItem;
  onCheckOff: (itemId: string) => void;
  onSwipe: (itemId: string) => void;
  /** Highlight with accent right border (RTL "start" border). */
  highlighted?: boolean;
}

export function ShoppingListItem({
  item,
  onCheckOff,
  onSwipe,
  highlighted = false,
}: ShoppingListItemProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const router = useRouter();
  const updateQuantity = useShoppingListStore((s) => s.updateQuantity);
  const reactivateItem = useShoppingListStore((s) => s.reactivateItem);
  const isPurchased = item.status === "purchased";
  const productName = item.product?.name ?? "";
  const subtitle = item.product?.category ?? "";

  // ── Animated values ────────────────────────────────────────
  const flashAnim = useRef(new Animated.Value(0)).current;
  const [flashing, setFlashing] = useState(false);
  const [reactivateFlashing, setReactivateFlashing] = useState(false);

  const rowBgColor = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [dark.surface, "#4ADE8044"],
  });

  const reactivateRowBg = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [dark.purchasedBg, "#6C5DD344"],
  });

  /** Quick green flash → checkOff */
  const animateCheckOff = useCallback(() => {
    setFlashing(true);
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
      setFlashing(false);
      flashAnim.setValue(0);
      onCheckOff(item.id);
    });
  }, [item.id, onCheckOff, flashAnim]);

  /** Quick accent flash → reactivate */
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

  // ── Swipe action ───────────────────────────────────────────
  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.5],
      extrapolate: "clamp",
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

  // ── Card content (matches main.html design) ────────────────
  const content = (
    <Animated.View
      style={[
        styles.card,
        highlighted && styles.cardHighlighted,
        isPurchased && !reactivateFlashing && styles.cardPurchased,
        isPurchased &&
          reactivateFlashing && {
            backgroundColor: reactivateRowBg,
            opacity: 1,
          },
        !isPurchased && { backgroundColor: rowBgColor },
      ]}
    >
      {/* Quantity controls (dark pill) — leading side */}
      {!isPurchased ? (
        <View style={styles.qtyPill}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => updateQuantity(item.id, item.quantity - 1)}
            activeOpacity={0.6}
            disabled={item.quantity <= 1}
          >
            <Text
              style={[
                styles.qtyBtnText,
                item.quantity <= 1 && styles.qtyBtnDisabled,
              ]}
            >
              −
            </Text>
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
      ) : (
        <View style={styles.qtySpacer} />
      )}

      {/* Product info */}
      <TouchableOpacity
        style={styles.info}
        onPress={() => router.push(`/item/${item.id}`)}
        activeOpacity={0.7}
      >
        <Text
          style={[styles.name, isPurchased && styles.namePurchased]}
          numberOfLines={1}
        >
          {productName}
          {isPurchased && item.quantity > 1 && (
            <Text style={styles.purchasedQty}> ×{item.quantity}</Text>
          )}
        </Text>
        {subtitle !== "" && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </TouchableOpacity>

      {/* Checkbox / mark-as-buy (trailing side) */}
      <TouchableOpacity
        style={[
          styles.checkbox,
          flashing && styles.checkboxFlash,
          isPurchased && !reactivateFlashing && styles.checkboxPurchased,
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
        {isPurchased ? (
          <Text
            style={[
              styles.checkIcon,
              reactivateFlashing && styles.reactivateIcon,
            ]}
          >
            +
          </Text>
        ) : flashing ? (
          <Text style={styles.flashCheckIcon}>✓</Text>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );

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

// ── Styles (card design matching main.html) ──────────────────
const styles = StyleSheet.create({
  // ── Card ───────────────────────────────────────────────────
  card: {
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: dark.surface,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: dark.cardRadius,
    marginHorizontal: 16,
    marginBottom: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  cardHighlighted: {
    borderRightWidth: 4,
    borderRightColor: dark.accent,
    marginRight: 8,
  },
  cardPurchased: {
    backgroundColor: dark.purchasedBg,
    opacity: 0.6,
  },

  // ── Checkbox (circular) ────────────────────────────────────
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: dark.checkbox,
    alignItems: "center",
    justifyContent: "center",
    marginStart: 12,
  },
  checkboxPurchased: {
    borderColor: dark.purchasedCheck,
    backgroundColor: dark.purchasedCheck,
  },
  checkboxFlash: {
    borderColor: dark.success,
    backgroundColor: dark.success + "1A",
  },
  checkboxReactivateFlash: {
    borderColor: dark.accent,
    backgroundColor: dark.accent + "33",
  },
  checkIcon: {
    color: dark.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  flashCheckIcon: {
    color: dark.success,
    fontSize: 16,
    fontWeight: "800",
  },
  reactivateIcon: {
    color: dark.accent,
    fontSize: 16,
    fontWeight: "800",
  },

  // ── Product info ───────────────────────────────────────────
  info: {
    flex: 1,
    direction: "rtl",
    writingDirection: "rtl",
    paddingEnd: 8,
  },
  name: {
    fontSize: 15,
    fontWeight: "500",
    color: dark.text,
  },
  namePurchased: {
    color: dark.textSecondary,
    fontWeight: "400",
    textDecorationLine: "line-through",
  },
  subtitle: {
    fontSize: 12,
    color: dark.textSecondary,
    marginTop: 2,
  },
  purchasedQty: {
    fontSize: 3,
    color: dark.textSecondary,
    fontWeight: "700",
  },

  // ── Quantity pill ──────────────────────────────────────────
  qtyPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: dark.surfaceDark,
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginEnd: 12,
    gap: 4,
  },
  qtyBtn: {
    width: 25,
    height: 25,
    borderRadius: 12,
    backgroundColor: dark.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: {
    fontSize: 18,
    color: dark.textSecondary,
    fontWeight: "400",
    lineHeight: 20,
  },
  qtyBtnDisabled: {
    color: dark.textMuted,
    opacity: 0.6,
  },
  qtyValue: {
    fontSize: 15,
    color: dark.text,
    fontWeight: "700",
    minWidth: 20,
    textAlign: "center",
  },
  qtySpacer: {
    width: 56,
  },

  // ── Swipe action ──────────────────────────────────────────
  swipeAction: {
    backgroundColor: dark.swipeOrange,
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: dark.cardRadius,
    marginEnd: 16,
    marginBottom: 8,
  },
  swipeEmoji: {
    fontSize: 24,
  },
  swipeLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
});
