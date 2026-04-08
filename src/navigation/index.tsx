// src/navigation/index.tsx
import React from 'react'
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme
} from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'

import { useAuthStore } from '../store/authStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { COLORS, FONT_SIZE, SHADOW, SPACING } from '../constants'

import LoginScreen from '../screens/LoginScreen'
import VerifyOtpScreen from '../screens/VerifyOtpScreen'
import HomeScreen from '../screens/HomeScreen'
import BookDetailScreen from '../screens/BookDetailScreen'
import AddEditEntryScreen from '../screens/AddEditEntryScreen'
import CreateBookScreen from '../screens/CreateBookScreen'
import MembersScreen from '../screens/MembersScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import ExportImportScreen from '../screens/ExportImportScreen'
import SettingsScreen from '../screens/SettingsScreen'
import OfflineBanner from '../components/common/OfflineBanner'

const Stack = createStackNavigator()
const Tab = createBottomTabNavigator()

// Tab icon config
const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Home: { active: 'albums', inactive: 'albums-outline' },
  Notifications: { active: 'notifications', inactive: 'notifications-outline' },
  Settings: { active: 'settings', inactive: 'settings-outline' }
}

function AuthStack () {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name='Login' component={LoginScreen} />
      <Stack.Screen
        name='VerifyOtp'
        component={VerifyOtpScreen}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  )
}

function MainTabs () {
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: [
          styles.tabBar,
          { backgroundColor: theme.tabBarBg, borderTopColor: theme.border }
        ],
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused }) => {
          const icons = TAB_ICONS[route.name] || {
            active: 'ellipse',
            inactive: 'ellipse-outline'
          }
          return (
            <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
              <Ionicons
                name={(focused ? icons.active : icons.inactive) as any}
                size={21}
                color={focused ? COLORS.primary : theme.textTertiary}
              />
            </View>
          )
        }
      })}
    >
      <Tab.Screen
        name='Home'
        component={HomeScreen}
        options={{ tabBarLabel: 'Books' }}
      />
      <Tab.Screen
        name='Notifications'
        component={NotificationsScreen}
        options={{ tabBarLabel: 'Inbox' }}
      />
      <Tab.Screen
        name='Settings'
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  )
}

function AppStack () {
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  return (
    <>
      <OfflineBanner />
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.headerBg,
            elevation: 0,
            shadowOpacity: 0
          },
          headerTitleStyle: {
            fontSize: FONT_SIZE.lg,
            fontWeight: '700',
            color: theme.text,
            letterSpacing: -0.3
          },
          headerTintColor: COLORS.primary,
          headerBackTitleVisible: false,
          headerShadowVisible: false,
          cardStyle: { backgroundColor: theme.background }
        }}
      >
        <Stack.Screen
          name='MainTabs'
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name='BookDetail'
          component={BookDetailScreen}
          options={({ route }: any) => ({
            title: route.params?.bookName || 'Book'
          })}
        />
        <Stack.Screen
          name='AddEditEntry'
          component={AddEditEntryScreen}
          options={({ route }: any) => ({
            title: route.params?.entry ? 'Edit Entry' : 'New Entry',
            presentation: 'modal'
          })}
        />
        <Stack.Screen
          name='CreateBook'
          component={CreateBookScreen}
          options={({ route }: any) => ({
            title: route.params?.book ? 'Edit Book' : 'New Book',
            presentation: 'modal'
          })}
        />
        <Stack.Screen
          name='Members'
          component={MembersScreen}
          options={{ title: 'Members & Invites' }}
        />
        <Stack.Screen
          name='ExportImport'
          component={ExportImportScreen}
          options={{ title: 'Export & Import' }}
        />
      </Stack.Navigator>
    </>
  )
}

export default function RootNavigator () {
  const { isAuthenticated, isLoading } = useAuthStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  // React Navigation theme object for background consistency
  const navTheme =
    mode === 'dark'
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            background: theme.background,
            card: theme.surface,
            border: theme.border,
            text: theme.text
          }
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            background: theme.background,
            card: theme.surface,
            border: theme.border,
            text: theme.text
          }
        }

  if (isLoading) {
    return (
      <LinearGradient colors={['#5B5FED', '#7C3AED']} style={styles.splash}>
        <View style={styles.splashIcon}>
          <Ionicons name='wallet' size={40} color='#fff' />
        </View>
        <Text style={styles.splashTitle}>CashFlow</Text>
        <Text style={styles.splashSub}>Loading...</Text>
      </LinearGradient>
    )
  }

  return (
    <NavigationContainer theme={navTheme}>
      {isAuthenticated ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  splashIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  splashTitle: {
    fontSize: FONT_SIZE['2xl'],
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5
  },
  splashSub: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.7)' },
  tabBar: {
    height: 62,
    paddingBottom: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    ...SHADOW.sm
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  tabIconWrap: {
    width: 34,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabIconActive: { backgroundColor: COLORS.primaryLight }
})
