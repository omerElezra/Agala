import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/src/lib/supabase';

type AuthMode = 'login' | 'signup';

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedPassword) {
      Alert.alert('שגיאה', 'יש למלא אימייל וסיסמה');
      return;
    }

    if (mode === 'signup' && trimmedPassword.length < 6) {
      Alert.alert('שגיאה', 'הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (error) {
        Alert.alert('שגיאת התחברות', translateAuthError(error.message));
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: trimmedPassword,
        options: {
          data: { display_name: displayName.trim() },
        },
      });

      if (error) {
        Alert.alert('שגיאת הרשמה', translateAuthError(error.message));
      } else {
        Alert.alert('ברוכים הבאים! 🎉', 'החשבון נוצר בהצלחה.');
      }
    }

    setLoading(false);
  };

  const toggleMode = () => {
    setMode((prev) => (prev === 'login' ? 'signup' : 'login'));
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Logo / Title */}
        <View style={styles.header}>
          <Text style={styles.emoji}>🛒</Text>
          <Text style={styles.title}>עגלה</Text>
          <Text style={styles.subtitle}>
            {mode === 'login' ? 'התחברות לחשבון' : 'יצירת חשבון חדש'}
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="שם תצוגה"
              placeholderTextColor="#999"
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              textAlign="right"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="אימייל"
            placeholderTextColor="#999"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            textAlign="left"
          />

          <TextInput
            style={styles.input}
            placeholder="סיסמה"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            textAlign="left"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'login' ? 'התחברות' : 'הרשמה'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Toggle login/signup */}
        <TouchableOpacity onPress={toggleMode} style={styles.toggleButton}>
          <Text style={styles.toggleText}>
            {mode === 'login'
              ? 'אין לך חשבון? הרשמה'
              : 'יש לך חשבון? התחברות'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Translate common Supabase auth errors to Hebrew ──────────
function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'אימייל או סיסמה לא נכונים';
  }
  if (message.includes('User already registered')) {
    return 'המשתמש כבר רשום במערכת';
  }
  if (message.includes('Email not confirmed')) {
    return 'יש לאשר את כתובת האימייל לפני ההתחברות';
  }
  if (message.includes('Password should be at least')) {
    return 'הסיסמה חייבת להכיל לפחות 6 תווים';
  }
  if (message.includes('Unable to validate email')) {
    return 'כתובת אימייל לא תקינה';
  }
  if (message.includes('rate limit')) {
    return 'נסיונות רבים מדי. נסו שוב בעוד מספר דקות';
  }
  return message;
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingStart: 24,
    paddingEnd: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    gap: 14,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingStart: 16,
    paddingEnd: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    color: '#1a1a2e',
  },
  button: {
    backgroundColor: '#2f95dc',
    borderRadius: 12,
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  toggleButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  toggleText: {
    color: '#2f95dc',
    fontSize: 15,
  },
});
