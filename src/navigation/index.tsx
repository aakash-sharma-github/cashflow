// src/navigation/index.tsx
import React from 'react'
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'

import { useAuthStore } from '../store/authStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { useInboxStore } from '../store/inboxStore'
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
import TodoScreen from '../screens/TodoScreen'
import EditProfileScreen from '../screens/EditProfileScreen'
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen'
import TermsScreen from '../screens/TermsScreen'
import OfflineBanner from '../components/common/OfflineBanner'

const Stack = createStackNavigator()
const Tab = createBottomTabNavigator()

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Home: { active: 'albums', inactive: 'albums-outline' },
  Notifications: { active: 'notifications', inactive: 'notifications-outline' },
  Settings: { active: 'settings', inactive: 'settings-outline' },
  Todos: { active: 'checkbox', inactive: 'checkbox-outline' },
}

function AuthStack() {
  const { mode } = useThemeStore()
  const theme = getTheme(mode)
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.headerBg, elevation: 0, shadowOpacity: 0 },
        headerTitleStyle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: theme.text },
        headerTintColor: COLORS.primary,
        headerBackTitleVisible: false,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} options={{ headerShown: false, gestureEnabled: false }} />
      {/* PrivacyPolicy and Terms accessible from login disclaimer before sign-in */}
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="Terms" component={TermsScreen} options={{ title: 'Terms & Conditions' }} />
    </Stack.Navigator>
  )
}

function InboxTabIcon({ focused, color }: { focused: boolean; color: string }) {
  const unreadCount = useInboxStore(s => s.unreadCount)
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
      <Ionicons
        name={(focused ? 'notifications' : 'notifications-outline') as any}
        size={21}
        color={color}
      />
      {unreadCount > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </View>
  )
}

function MainTabs() {
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: [styles.tabBar, { backgroundColor: theme.tabBarBg, borderTopColor: theme.border }],
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: theme.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color }) => {
          // Inbox tab gets special badge treatment
          if (route.name === 'Notifications') {
            return <InboxTabIcon focused={focused} color={color} />
          }
          const icons = TAB_ICONS[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' }
          return (
            <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
              <Ionicons
                name={(focused ? icons.active : icons.inactive) as any}
                size={21}
                color={color}
              />
            </View>
          )
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Books' }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarLabel: 'Inbox' }} />
      <Tab.Screen name="Todos" component={TodoScreen} options={{ tabBarLabel: 'Tasks' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarLabel: 'Settings' }} />
    </Tab.Navigator>
  )
}

function AppStack() {
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  return (
    <>
      <OfflineBanner />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.headerBg, elevation: 0, shadowOpacity: 0 },
          headerTitleStyle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: theme.text, letterSpacing: -0.3 },
          headerTintColor: COLORS.primary,
          headerBackTitleVisible: false,
          headerShadowVisible: false,
          cardStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="BookDetail" component={BookDetailScreen} options={({ route }: any) => ({ title: route.params?.bookName || 'Book' })} />
        <Stack.Screen
          name="AddEditEntry"
          component={AddEditEntryScreen}
          options={({ route }: any) => ({
            // Use default header with back arrow — title shown inside screen
            headerShown: false,
            presentation: Platform.OS === 'ios' ? 'modal' : 'card',
            gestureEnabled: false,
          })}
        />
        <Stack.Screen
          name="CreateBook"
          component={CreateBookScreen}
          options={{
            headerShown: false,
            // No modal — CreateBook manages its own header with close button
          }}
        />
        <Stack.Screen name="Members" component={MembersScreen} options={{ title: 'Members & Invites' }} />
        <Stack.Screen name="ExportImport" component={ExportImportScreen} options={{ title: 'Export & Import' }} />
        <Stack.Screen
          name="EditProfile"
          component={EditProfileScreen}
          options={{
            title: 'Edit Profile',
            presentation: 'modal',
            contentStyle: { backgroundColor: theme.background },
            headerStyle: { backgroundColor: theme.background },
          }}
        />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} options={{ title: 'Privacy Policy' }} />
        <Stack.Screen name="Terms" component={TermsScreen} options={{ title: 'Terms & Conditions' }} />
      </Stack.Navigator>
    </>
  )
}

export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  const navTheme = mode === 'dark'
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: theme.background, card: theme.surface, border: theme.border, text: theme.text } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: theme.background, card: theme.surface, border: theme.border, text: theme.text } }

  if (isLoading) {
    return (
      <LinearGradient
        colors={['#4F46E5', '#5B5FED', '#7C3AED']}
        start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }}
        style={styles.splash}
      >
        {/* Deco circles — matches native splash.png */}
        <View style={styles.splashDeco1} />
        <View style={styles.splashDeco2} />
        {/* App icon — pure view, no asset download required */}
        <LinearGradient
          colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.10)']}
          style={styles.splashIconImg}
        >
          <Text style={styles.splashIconEmoji}>💰</Text>
        </LinearGradient>
        <Text style={styles.splashTitle}>CashFlow</Text>
        <Text style={styles.splashSub}>Track. Collaborate. Grow.</Text>
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
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  splashDeco1: {
    position: 'absolute', width: 360, height: 360, borderRadius: 180,
    backgroundColor: 'rgba(255,255,255,0.05)', top: -80, right: -60,
  },
  splashDeco2: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.04)', bottom: -40, left: -40,
  },
  splashIconImg: { width: 100, height: 100, borderRadius: 26, marginBottom: 20, alignItems: 'center', justifyContent: 'center' },
  splashIconEmoji: { fontSize: 48 },
  splashTitle: { fontSize: FONT_SIZE['3xl'], fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 8 },
  splashSub: { fontSize: FONT_SIZE.md, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.5 },

  tabBar: { height: 62, paddingBottom: 8, paddingTop: 6, borderTopWidth: 1, ...SHADOW.sm },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  tabIconWrap: { width: 34, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: COLORS.primaryLight },

  // Badge on the inbox tab icon
  tabBadge: {
    position: 'absolute', top: -3, right: -4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: COLORS.cashOut,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: '#fff',  // white ring for contrast
  },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', lineHeight: 11 },
})