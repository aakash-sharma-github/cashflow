// App.tsx
import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import RootNavigator from './src/navigation'
import { useAuthStore } from './src/store/authStore'
import { useOfflineSync } from './src/hooks/useOfflineSync'

function AppContent() {
  const initialize = useAuthStore(s => s.initialize)
  // Wire up offline sync + network listener globally
  useOfflineSync()

  useEffect(() => {
    initialize()
  }, [])

  return <RootNavigator />
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
