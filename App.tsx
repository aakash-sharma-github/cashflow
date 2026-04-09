import React, { useEffect, useState, useCallback } from 'react'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import RootNavigator from './src/navigation'
import { useAuthStore } from './src/store/authStore'
import { useThemeStore } from './src/store/themeStore'
import { useOfflineSync } from './src/hooks/useOfflineSync'
import * as SplashScreen from 'expo-splash-screen'

SplashScreen.preventAutoHideAsync() // Keep splash screen visible

function AppContent() {
  const initialize = useAuthStore(s => s.initialize)
  const loadTheme = useThemeStore(s => s.load)
  const mode = useThemeStore(s => s.mode)
  useOfflineSync()

  const [appIsReady, setAppIsReady] = useState(false)

  useEffect(() => {
    async function prepareApp() {
      try {
        await initialize() // Wait for auth initialization
        await loadTheme()   // Wait for theme loading
        // Any other async setup can go here
      } catch (e) {
        console.warn(e) // Log errors
      } finally {
        setAppIsReady(true) // Mark app ready
      }
    }
    prepareApp()
  }, [])

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync() // Hide splash only when ready
    }
  }, [appIsReady])

  if (!appIsReady) {
    return null // Keep splash visible
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <SafeAreaProvider>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

export default AppContent


// import React, { useEffect } from 'react'
// import { StatusBar } from 'expo-status-bar'
// import { GestureHandlerRootView } from 'react-native-gesture-handler'
// import { SafeAreaProvider } from 'react-native-safe-area-context'
// import RootNavigator from './src/navigation'
// import { useAuthStore } from './src/store/authStore'
// import { useThemeStore } from './src/store/themeStore'
// import { useOfflineSync } from './src/hooks/useOfflineSync'

// function AppContent() {
//   const initialize = useAuthStore(s => s.initialize)
//   const loadTheme = useThemeStore(s => s.load)
//   const mode = useThemeStore(s => s.mode)
//   useOfflineSync()

//   useEffect(() => {
//     initialize()
//     loadTheme()
//   }, [])

//   return (
//     <>
//       <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
//       <RootNavigator />
//     </>
//   )
// }

// export default function App() {
//   return (
//     <GestureHandlerRootView style={{ flex: 1 }}>
//       <SafeAreaProvider>
//         <AppContent />
//       </SafeAreaProvider>
//     </GestureHandlerRootView>
//   )
// }