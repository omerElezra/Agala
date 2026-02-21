import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

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

// ── Styles (RTL-safe) ────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopStartRadius: 20,
    borderTopEndRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    color: '#222',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    gap: 12,
  },
  optionText: {
    fontSize: 16,
    color: '#333',
  },
  optionEmoji: {
    fontSize: 20,
  },
  removeOption: {
    backgroundColor: '#fff0f0',
  },
  removeText: {
    fontSize: 16,
    color: '#d32f2f',
  },
  cancelBtn: {
    marginTop: 6,
    alignItems: 'center',
    padding: 14,
  },
  cancelText: {
    fontSize: 16,
    color: '#888',
  },
});
