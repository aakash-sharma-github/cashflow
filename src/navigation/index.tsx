// src/navigation/index.tsx
import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createStackNavigator } from '@react-navigation/stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { View, Text, StyleSheet } from 'react-native'

import { useAuthStore } from '../store/authStore'
import { COLORS, FONT_SIZE, SHADOW } from '../constants'

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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textTertiary,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Books', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📚</Text> }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ tabBarLabel: 'Inbox', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🔔</Text> }}
      />
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
        }}
      >
        <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="BookDetail" component={BookDetailScreen} options={({ route }: any) => ({ title: route.params?.bookName || 'Book' })} />
        <Stack.Screen name="AddEditEntry" component={AddEditEntryScreen} options={({ route }: any) => ({ title: route.params?.entry ? 'Edit Entry' : 'New Entry', presentation: 'modal' })} />
        <Stack.Screen name="CreateBook" component={CreateBookScreen} options={({ route }: any) => ({ title: route.params?.book ? 'Edit Book' : 'New Book', presentation: 'modal' })} />
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
      <View style={styles.splash}>
        <Text style={styles.splashEmoji}>💰</Text>
        <Text style={styles.splashTitle}>CashFlow</Text>
      </View>
    )
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <AppStack /> : <AuthStack />}
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  splashEmoji: { fontSize: 60, marginBottom: 16 },
  splashTitle: { fontSize: 32, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  header: { backgroundColor: COLORS.background, elevation: 0 },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text, letterSpacing: -0.3 },
  tabBar: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border, borderTopWidth: 1, height: 60, paddingBottom: 8, ...SHADOW.md },
  tabLabel: { fontSize: FONT_SIZE.xs, fontWeight: '600' },
  tabItem: { paddingTop: 8 },
})
