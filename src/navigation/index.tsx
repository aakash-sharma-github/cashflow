// src/navigation/index.tsx — Redesigned v2
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'

import { useAuthStore } from '../store/authStore'
import { COLORS, FONT_SIZE, SHADOW, SPACING, BORDER_RADIUS } from '../constants'

import LoginScreen from '../screens/LoginScreen'
import VerifyOtpScreen from '../screens/VerifyOtpScreen'
import HomeScreen from '../screens/HomeScreen'
import BookDetailScreen from '../screens/BookDetailScreen'
import AddEditEntryScreen from '../screens/AddEditEntryScreen'
import CreateBookScreen from '../screens/CreateBookScreen'
import MembersScreen from '../screens/MembersScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import ExportImportScreen from '../screens/ExportImportScreen'
import OfflineBanner from '../components/common/OfflineBanner'

const Stack = createStackNavigator()
const Tab = createBottomTabNavigator()

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, cardStyle: { backgroundColor: COLORS.background } }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: true,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused, size }) => {
          const icons: Record<string, { active: string; inactive: string }> = {
            Home: { active: 'albums', inactive: 'albums-outline' },
            Notifications: { active: 'notifications', inactive: 'notifications-outline' },
          }
          const iconSet = icons[route.name] || { active: 'ellipse', inactive: 'ellipse-outline' }
          return (
            <View style={[styles.tabIconWrap, focused && styles.tabIconActive]}>
              <Ionicons
                name={(focused ? iconSet.active : iconSet.inactive) as any}
                size={22}
                color={focused ? COLORS.primary : COLORS.textTertiary}
              />
            </View>
          )
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Books' }} />
      <Tab.Screen name="Notifications" component={NotificationsScreen} options={{ tabBarLabel: 'Inbox' }} />
    </Tab.Navigator>
  )
}

function AppStack() {
  return (
    <>
      <OfflineBanner />
      <Stack.Navigator
        screenOptions={{
          headerStyle: styles.header,
          headerTitleStyle: styles.headerTitle,
          headerTintColor: COLORS.text,
          headerBackTitleVisible: false,
          headerShadowVisible: false,
          cardStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen
          name="BookDetail"
          component={BookDetailScreen}
          options={({ route }: any) => ({ title: route.params?.bookName || 'Book' })}
        />
        <Stack.Screen
          name="AddEditEntry"
          component={AddEditEntryScreen}
          options={({ route }: any) => ({
            title: route.params?.entry ? 'Edit Entry' : 'New Entry',
            presentation: 'modal',
          })}
        />
        <Stack.Screen
          name="CreateBook"
          component={CreateBookScreen}
          options={({ route }: any) => ({
            title: route.params?.book ? 'Edit Book' : 'New Book',
            presentation: 'modal',
          })}
        />
        <Stack.Screen name="Members" component={MembersScreen} options={{ title: 'Members & Invites' }} />
        <Stack.Screen name="ExportImport" component={ExportImportScreen} options={{ title: 'Export & Import' }} />
      </Stack.Navigator>
    </>
  )
}

export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return (
      <LinearGradient colors={['#5B5FED', '#7C3AED']} style={styles.splash}>
        <View style={styles.splashIcon}>
          <Ionicons name="wallet" size={40} color="#fff" />
        </View>
        <Text style={styles.splashTitle}>CashFlow</Text>
        <Text style={styles.splashSub}>Loading...</Text>
      </LinearGradient>
    )
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  splashIcon: { width: 72, height: 72, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  splashTitle: { fontSize: FONT_SIZE['2xl'], fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  splashSub: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.7)' },

  header: { backgroundColor: COLORS.background, elevation: 0 },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },

  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border, borderTopWidth: 1,
    height: 62, paddingBottom: 8, paddingTop: 6,
    ...SHADOW.md,
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  tabIconWrap: { width: 34, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabIconActive: { backgroundColor: COLORS.primaryLight },
})
