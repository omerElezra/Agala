import { dark } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useRef } from "react";
import {
    Animated,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import type { RecommendationItem } from "../store/shoppingListStore";

interface RecommendationLineProps {
  recommendations: RecommendationItem[];
  onAdd: (rec: RecommendationItem) => void;
  onSkip: (rec: RecommendationItem) => void;
}

function RecChip({
  item,
  onAdd,
  onSkip,
}: {
  item: RecommendationItem;
  onAdd: (rec: RecommendationItem) => void;
  onSkip: (rec: RecommendationItem) => void;
}) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animateOut = useCallback(
    (cb: () => void) => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.85,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => cb());
    },
    [fadeAnim, scaleAnim],
  );

  return (
    <Animated.View
      style={[
        styles.chip,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <Text style={styles.chipName} numberOfLines={1}>
        {item.product.name}
      </Text>
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => animateOut(() => onAdd(item))}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <Ionicons name="add" size={16} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.skipBtn}
        onPress={() => animateOut(() => onSkip(item))}
        activeOpacity={0.7}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      >
        <Ionicons name="close" size={14} color={dark.textSecondary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export function RecommendationLine({
  recommendations,
  onAdd,
  onSkip,
}: RecommendationLineProps) {
  if (recommendations.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="sparkles" size={14} color={dark.accent} />
        <Text style={styles.header}>הצעות AI חכמות</Text>
      </View>
      <FlatList
        horizontal
        inverted={false}
        showsHorizontalScrollIndicator={false}
        data={recommendations}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <RecChip item={item} onAdd={onAdd} onSkip={onSkip} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: dark.border,
    backgroundColor: dark.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingStart: 16,
    paddingEnd: 16,
    marginBottom: 6,
  },
  header: {
    fontSize: 12,
    fontWeight: "600",
    color: dark.textSecondary,
  },
  listContent: {
    paddingStart: 14,
    paddingEnd: 14,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: 6,
    paddingStart: 10,
    paddingEnd: 6,
    borderWidth: 1,
    borderColor: `${dark.accent}4D`,
    backgroundColor: `${dark.accent}14`,
    gap: 6,
  },
  chipName: {
    fontSize: 13,
    fontWeight: "600",
    color: dark.text,
    maxWidth: 100,
  },
  addBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: dark.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: dark.textSecondary + "55",
    alignItems: "center",
    justifyContent: "center",
  },
});
