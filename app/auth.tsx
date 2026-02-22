import React, { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { dark } from '@/constants/theme';

type AuthMode = 'login' | 'signup';
type BannerType = 'error' | 'success' | 'info';

interface Banner {
  type: BannerType;
  message: string;
}

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  /** Show an inline banner message instead of Alert.alert (works on web + native) */
  const showBanner = (type: BannerType, message: string) => {
    setBanner({ type, message });
    // Auto-dismiss success/info banners after 5s
    if (type !== 'error') {
      setTimeout(() => setBanner(null), 5000);
    }
  };

  const handleAuth = async () => {
    setBanner(null); // clear previous banner
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    console.log('[Auth] handleAuth called', { mode, email: trimmedEmail });

    if (!trimmedEmail || !trimmedPassword) {
      showBanner('error', 'יש למלא אימייל וסיסמה');
      return;
    }

    if (mode === 'signup' && trimmedPassword.length < 6) {
      showBanner('error', 'הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'login') {
        console.log('[Auth] Calling signInWithPassword…');
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: trimmedPassword,
        });

        if (error) {
          console.error('[Auth] signIn error:', error.message, error);
          showBanner('error', translateAuthError(error.message));
        } else {
          console.log('[Auth] signIn success, session:', !!data.session);
          // Session will trigger redirect via useAuth — no banner needed
        }
      } else {
        console.log('[Auth] Calling signUp…');
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          options: {
            data: { display_name: displayName.trim() },
          },
        });

        if (error) {
          console.error('[Auth] signUp error:', error.message, error);
          showBanner('error', translateAuthError(error.message));
        } else if (data.session) {
          // Auto-confirmed → session exists → redirect will happen
          console.log('[Auth] signUp success with session');
          showBanner('success', 'ברוכים הבאים! 🎉 החשבון נוצר בהצלחה.');
        } else if (data.user && !data.session) {
          // Email confirmation required
          console.log('[Auth] signUp success, confirmation required');
          showBanner('info', '📧 נשלח אימייל אימות. בדקו את תיבת הדואר ולחצו על הקישור.');
        } else {
          // User already exists (Supabase returns fake success to prevent enumeration)
          showBanner('info', 'אם החשבון קיים, נשלח אימייל אימות. בדקו את תיבת הדואר.');
        }
      }
    } catch (err) {
      console.error('[Auth] Unexpected error:', err);
      showBanner('error', 'שגיאה לא צפויה. בדקו חיבור לאינטרנט.');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setBanner(null);
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

        {/* Inline Banner (replaces Alert.alert for web compatibility) */}
        {banner && (
          <View
            style={[
              styles.banner,
              banner.type === 'error' && styles.bannerError,
              banner.type === 'success' && styles.bannerSuccess,
              banner.type === 'info' && styles.bannerInfo,
            ]}
          >
            <Text style={styles.bannerText}>{banner.message}</Text>
            <TouchableOpacity onPress={() => setBanner(null)}>
              <Text style={styles.bannerClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Form */}
        <View style={styles.form}>
          {mode === 'signup' && (
            <TextInput
              style={styles.input}
              placeholder="שם תצוגה"
              placeholderTextColor={dark.placeholder}
              value={displayName}
              onChangeText={setDisplayName}
              autoCapitalize="words"
              textAlign="right"
            />
          )}

          <TextInput
            style={styles.input}
            placeholder="אימייל"
            placeholderTextColor={dark.placeholder}
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
            placeholderTextColor={dark.placeholder}
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
  if (message.includes('rate limit') || message.includes('too many requests') || message.includes('For security purposes')) {
    return 'נסיונות רבים מדי. נסו שוב בעוד מספר דקות.';
  }
  if (message.includes('Email rate limit exceeded')) {
    return 'שלחנו יותר מדי אימיילים. נסו שוב בעוד מספר דקות.';
  }
  return message;
}

// ── Styles (Dark mode) ───────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: dark.background,
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
    color: dark.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: dark.textSecondary,
  },
  // ── Banner (inline error / success / info) ─────────────────
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingStart: 16,
    paddingEnd: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  bannerError: {
    backgroundColor: dark.errorBg,
    borderWidth: 1,
    borderColor: dark.error,
  },
  bannerSuccess: {
    backgroundColor: dark.successBg,
    borderWidth: 1,
    borderColor: dark.success,
  },
  bannerInfo: {
    backgroundColor: dark.infoBg,
    borderWidth: 1,
    borderColor: dark.info,
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    color: dark.text,
    textAlign: 'right',
    lineHeight: 20,
  },
  bannerClose: {
    fontSize: 16,
    color: dark.textSecondary,
    paddingStart: 12,
    paddingTop: 2,
  },
  form: {
    gap: 14,
  },
  input: {
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.inputBorder,
    borderRadius: 12,
    paddingStart: 16,
    paddingEnd: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    color: dark.inputText,
  },
  button: {
    backgroundColor: dark.accent,
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
    color: dark.accent,
    fontSize: 15,
  },
});
