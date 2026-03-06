import { dark } from "@/constants/theme";
import { CATEGORIES } from "@/src/utils/categoryDetector";
import React from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface CategorySheetProps {
  visible: boolean;
  productName: string;
  currentCategory: string | null;
  onSelect: (category: string) => void;
  onClose: () => void;
}

export function CategorySheet({
  visible,
  productName,
  currentCategory,
  onSelect,
  onClose,
}: CategorySheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />

          <Text style={styles.title}>בחר קטגוריה</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {productName}
          </Text>

          <ScrollView
            style={styles.scrollArea}
            showsVerticalScrollIndicator={false}
          >
            {CATEGORIES.map((cat) => {
              const isActive = currentCategory === cat.name;
              return (
                <TouchableOpacity
                  key={cat.name}
                  style={[styles.option, isActive && styles.optionActive]}
                  onPress={() => onSelect(cat.name)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.optionEmoji}>{cat.emoji}</Text>
                  <Text
                    style={[
                      styles.optionText,
                      isActive && styles.optionTextActive,
                    ]}
                  >
                    {cat.name}
                  </Text>
                  {isActive && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>ביטול</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: dark.surface,
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    padding: 22,
    paddingBottom: 40,
    maxHeight: "70%",
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: dark.textMuted,
    alignSelf: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: "800",
    textAlign: "center",
    color: dark.text,
  },
  subtitle: {
    fontSize: 14,
    textAlign: "center",
    color: dark.textSecondary,
    marginBottom: 16,
  },
  scrollArea: {
    flexGrow: 0,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    backgroundColor: dark.surfaceAlt,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    gap: 12,
    borderWidth: 1,
    borderColor: dark.border,
  },
  optionActive: {
    borderColor: dark.accent,
    backgroundColor: dark.accent + "18",
  },
  optionEmoji: {
    fontSize: 22,
  },
  optionText: {
    fontSize: 15,
    color: dark.text,
    fontWeight: "600",
    flex: 1,
  },
  optionTextActive: {
    color: dark.accent,
  },
  checkmark: {
    fontSize: 18,
    color: dark.accent,
    fontWeight: "700",
  },
  cancelBtn: {
    marginTop: 10,
    alignItems: "center",
    padding: 16,
  },
  cancelText: {
    fontSize: 16,
    color: dark.textSecondary,
    fontWeight: "600",
  },
});
