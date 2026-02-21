# Expo Project Setup Commands

## Prerequisites
```bash
# Ensure Node.js >= 18 is installed
node -v

# Install Expo CLI globally (if not already)
npm install -g expo-cli eas-cli
```

## 1. Create the Expo Project
```bash
cd /Users/oelezra/github/personal-apps/listapp

npx create-expo-app@latest smart-grocery-list --template tabs
cd smart-grocery-list
```

## 2. Install Core Dependencies
```bash
# Supabase Client
npx expo install @supabase/supabase-js

# Async Storage (required for Supabase Auth session persistence)
npx expo install @react-native-async-storage/async-storage

# State Management
npx expo install zustand

# Sentry for Crash Reporting
npx expo install @sentry/react-native

# URL polyfill (needed for Supabase on React Native)
npx expo install react-native-url-polyfill
```

## 3. Install Dev Dependencies
```bash
# TypeScript strict mode is already included with the tabs template
# Add useful dev tools:
npm install -D @types/react @types/react-native
```

## 4. Configure TypeScript Strict Mode
Edit `tsconfig.json` — ensure these flags are set:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

## 5. Project Structure (Create Folders)
```bash
mkdir -p src/lib
mkdir -p src/store
mkdir -p src/hooks
mkdir -p src/components
mkdir -p src/types
mkdir -p supabase/migrations
```

## 6. Create Supabase Client File
```bash
cat > src/lib/supabase.ts << 'EOF'
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
EOF
```

## 7. Create `.env` File
```bash
cat > .env << 'EOF'
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
EOF
```

## 8. EAS Setup (Build & OTA)
```bash
eas init
eas build:configure
```

## 9. Run the App
```bash
# iOS Simulator
npx expo start --ios

# Android Emulator
npx expo start --android

# Web (for quick testing)
npx expo start --web
```
