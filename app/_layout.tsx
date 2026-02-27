import FontAwesome from "@expo/vector-icons/FontAwesome";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Redirect, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { useColorScheme } from "@/components/useColorScheme";
import { dark } from "@/constants/theme";
import { useAuth } from "@/src/hooks/useAuth";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary
} from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

function HeaderExit({
  displayName,
  onSignOut,
}: {
  displayName: string;
  onSignOut: () => void;
}) {
  return (
    <View style={headerStyles.exitRow}>
      <TouchableOpacity
        onPress={onSignOut}
        style={headerStyles.exitBtn}
        activeOpacity={0.6}
      >
        <MaterialCommunityIcons
          name="exit-run"
          size={22}
          color={dark.textSecondary}
        />
      </TouchableOpacity>
      {displayName ? (
        <Text style={headerStyles.exitName}>{displayName}</Text>
      ) : null}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  exitRow: {
    flexDirection: "row",
    direction: "ltr",
    alignItems: "center",
    gap: 8,
    paddingStart: 4,
  },
  exitName: {
    fontSize: 13,
    fontWeight: "600",
    color: dark.textSecondary,
  },
  exitBtn: {
    padding: 8,
  },
});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, user, signOut, isLoading } = useAuth();

  // Show loading spinner while checking auth state
  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: dark.background,
        }}
      >
        <ActivityIndicator size="large" color={dark.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, headerTitleAlign: "center" }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="auth"
            options={{ animationTypeForReplace: "pop" }}
          />
          <Stack.Screen
            name="item/[id]"
            options={{
              headerShown: true,
              presentation: "card",
            }}
          />
          <Stack.Screen
            name="modal"
            options={{
              headerShown: true,
              presentation: "modal",
              headerLeft: () => (
                <HeaderExit
                  displayName={user?.display_name ?? ""}
                  onSignOut={() => {
                    signOut().catch(() => {});
                  }}
                />
              ),
            }}
          />
        </Stack>
        {/* Redirect based on auth state */}
        {session ? <Redirect href="/(tabs)" /> : <Redirect href="/auth" />}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
