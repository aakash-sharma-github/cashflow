import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import RootNavigator from './src/navigation'
import { useAuthStore } from './src/store/authStore'
import { useThemeStore } from './src/store/themeStore'
import { useOfflineSync } from './src/hooks/useOfflineSync'

function AppContent() {
  const initialize = useAuthStore(s => s.initialize)
  const loadTheme = useThemeStore(s => s.load)
  const mode = useThemeStore(s => s.mode)
  useOfflineSync()

  useEffect(() => {
    initialize()
    loadTheme()
  }, [])

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