import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs, useRouter } from 'expo-router';

import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useAuth } from '@/src/hooks/useAuth';
import { dark } from '@/constants/theme';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

function HeaderLogo() {
  return (
    <View style={headerStyles.row}>
      <Image
        source={require('@/assets/images/icon.png')}
        style={headerStyles.logo}
      />
    </View>
  );
}

function HeaderExit() {
  const { user, signOut } = useAuth();
  const displayName = user?.display_name || '';
  return (
    <View style={headerStyles.exitRow}>
      {displayName ? <Text style={headerStyles.exitName}>{displayName}</Text> : null}
      <TouchableOpacity onPress={signOut} style={headerStyles.exitBtn} activeOpacity={0.6}>
        <FontAwesome name="sign-out" size={20} color={dark.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 70, height: 70, borderRadius: 12 },
  exitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingEnd: 4 },
  exitName: { fontSize: 13, fontWeight: '600', color: dark.textSecondary },
  exitBtn: { padding: 8 },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: dark.accent,
        tabBarInactiveTintColor: dark.textMuted,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
        headerTitleAlign: 'center',
        headerStyle: {
          backgroundColor: dark.surface,
          shadowColor: dark.accent,
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 8,
        },
        headerTintColor: dark.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 19, letterSpacing: 0.5 },
        headerTitle: () => <HeaderLogo />,
        headerLeft: () => null,
        headerRight: () => <HeaderExit />,
        tabBarStyle: {
          backgroundColor: dark.surface,
          borderTopColor: dark.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 6,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarLabelPosition: 'beside-icon',
      }}>
      <Tabs.Screen
        name="settings"
        options={{
          title: 'הגדרות',
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'עגלה',
          tabBarIcon: ({ color }) => <TabBarIcon name="shopping-cart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: 'היסטוריה',
          tabBarIcon: ({ color }) => <TabBarIcon name="history" color={color} />,
        }}
      />

    </Tabs>
  );
}
