import { dark } from "@/constants/theme";
import React from "react";
import { StyleSheet, TextInput, View } from "react-native";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

/**
 * Glass-style search bar matching the main.html reference design.
 * Features: rounded-xl, surface background with highlight border,
 * right-aligned placeholder (RTL), focus ring in accent color.
 */
export function SearchBar({
  value,
  onChangeText,
  placeholder = "חפש מוצר להוספה...",
}: SearchBarProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.iconContainer}>
        <SearchIcon />
      </View>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={dark.placeholder}
        selectionColor={dark.accent}
        autoCorrect={false}
      />
    </View>
  );
}

/** Simple magnifying glass icon using Unicode */
function SearchIcon() {
  return (
    <View style={styles.icon}>
      <View style={styles.iconCircle} />
      <View style={styles.iconHandle} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 44,
    borderRadius: 12,
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.surfaceHighlight,
    flexDirection: "row-reverse",
    alignItems: "center",
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginStart: 4,
  },
  icon: {
    width: 18,
    height: 18,
    position: "relative",
  },
  iconCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: dark.textSecondary,
    position: "absolute",
    top: 0,
    right: 0,
  },
  iconHandle: {
    width: 2,
    height: 7,
    backgroundColor: dark.textSecondary,
    borderRadius: 1,
    position: "absolute",
    bottom: 0,
    left: 2,
    transform: [{ rotate: "-45deg" }],
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 14,
    color: dark.inputText,
    textAlign: "right",
    writingDirection: "rtl",
    paddingHorizontal: 8,
  },
});
