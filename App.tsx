// App.tsx
import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SplashScreen from 'expo-splash-screen'
import RootNavigator from './src/navigation'
import { useAuthStore } from './src/store/authStore'
import { useThemeStore } from './src/store/themeStore'
import { useTodoStore } from './src/store/todoStore'
import { useOfflineSync } from './src/hooks/useOfflineSync'
import { usePushNotifications } from './src/hooks/usePushNotifications'
import { ThemedAlertProvider } from './src/components/common/ThemedAlert'
import { notificationService } from './src/services/notificationService'

// Keep the native splash visible until we explicitly hide it
// This prevents the "white flash" between native splash and React render
SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden — fine to ignore
})

function AppContent() {
  const initialize = useAuthStore(s => s.initialize)
  const isLoading = useAuthStore(s => s.isLoading)
  const loadTheme = useThemeStore(s => s.load)
  const loadTodos = useTodoStore(s => s.load)
  const mode = useThemeStore(s => s.mode)

  useOfflineSync()
  usePushNotifications()

  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    const boot = async () => {
      try {
        // Request notification permission at app boot — before auth
        // This ensures channels are created and permission is granted early
        notificationService.setup().catch(() => { })
        await Promise.all([initialize(), loadTheme()])
      } catch (e) {
        // ignore
      } finally {
        SplashScreen.hideAsync().catch(() => { })
      }
    }
    boot()
  }, [])

  // Load todos with the user's ID once authenticated
  // This ensures each user gets their own todo list
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      loadTodos(user.id)
    } else if (!isAuthenticated) {
      // Reset in-memory todos on logout (keeps AsyncStorage intact for next login)
      useTodoStore.getState().reset()
    }
  }, [isAuthenticated, user?.id])

  // isLoading drives our custom gradient splash (shown by RootNavigator)
  // The native OS splash is gone by now; React renders immediately
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <ThemedAlertProvider />
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