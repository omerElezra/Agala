import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { dark } from '@/constants/theme';

interface SnoozeSheetProps {
  visible: boolean;
  productName: string;
  onSnooze: (days: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function SnoozeSheet({
  visible,
  productName,
  onSnooze,
  onRemove,
  onClose,
}: SnoozeSheetProps) {
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

          <Text style={styles.title}>מתי צריך {productName}?</Text>

          <TouchableOpacity
            style={styles.option}
            onPress={() => onSnooze(7)}
          >
            <Text style={styles.optionEmoji}>📅</Text>
            <Text style={styles.optionText}>בעוד שבוע</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={() => onSnooze(14)}
          >
            <Text style={styles.optionEmoji}>📅</Text>
            <Text style={styles.optionText}>בעוד שבועיים</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.option, styles.removeOption]}
            onPress={onRemove}
          >
            <Text style={styles.optionEmoji}>🗑️</Text>
            <Text style={styles.removeText}>הסר / לא צריך</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>ביטול</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

// ── Styles (Dark mode, RTL-safe) ─────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: dark.surface,
    borderTopStartRadius: 24,
    borderTopEndRadius: 24,
    padding: 22,
    paddingBottom: 40,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: dark.textMuted,
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 22,
    color: dark.text,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: dark.surfaceAlt,
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    gap: 14,
    borderWidth: 1,
    borderColor: dark.border,
  },
  optionText: {
    fontSize: 16,
    color: dark.text,
    fontWeight: '600',
  },
  optionEmoji: {
    fontSize: 22,
  },
  removeOption: {
    backgroundColor: dark.errorBg,
    borderColor: dark.error + '44',
  },
  removeText: {
    fontSize: 16,
    color: dark.error,
    fontWeight: '600',
  },
  cancelBtn: {
    marginTop: 8,
    alignItems: 'center',
    padding: 16,
  },
  cancelText: {
    fontSize: 16,
    color: dark.textSecondary,
    fontWeight: '600',
  },
});
