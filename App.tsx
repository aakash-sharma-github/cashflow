// App.tsx
import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SplashScreen from 'expo-splash-screen'
import RootNavigator from './src/navigation'
import { useAuthStore } from './src/store/authStore'
import { useThemeStore } from './src/store/themeStore'
import { useOfflineSync } from './src/hooks/useOfflineSync'
import { usePushNotifications } from './src/hooks/usePushNotifications'

// Keep the native splash visible until we explicitly hide it
// This prevents the "white flash" between native splash and React render
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden — fine to ignore
})

function AppContent() {
  const initialize = useAuthStore(s => s.initialize)
  const isLoading = useAuthStore(s => s.isLoading)
  const loadTheme = useThemeStore(s => s.load)
  const mode = useThemeStore(s => s.mode)

  useOfflineSync()
  usePushNotifications()

  useEffect(() => {
    const boot = async () => {
      try {
        // Run both in parallel — neither should block the other
        await Promise.all([
          initialize(),
          loadTheme(),
        ])
      } catch (e) {
        console.warn('[App] boot error:', e)
      } finally {
        // Always hide the native splash screen, even if something errored
        SplashScreen.hideAsync().catch(() => { })
      }
    }
    boot()
  }, [])

  // isLoading drives our custom gradient splash (shown by RootNavigator)
  // The native OS splash is gone by now; React renders immediately
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}