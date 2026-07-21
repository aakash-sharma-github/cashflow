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
import { InteractionManager } from 'react-native'
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
        // Hide native splash immediately — JS splash takes over
        SplashScreen.hideAsync().catch(() => { })

        // Critical path: auth + theme only — show the app as fast as possible
        await Promise.all([initialize(), loadTheme()])

        // Non-critical: defer notification setup until after first frame is drawn
        // This prevents notification channel setup from blocking the UI
        InteractionManager.runAfterInteractions(() => {
          notificationService.setup().catch(() => { })
        })
      } catch (e) {
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