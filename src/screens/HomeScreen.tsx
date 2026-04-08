// src/screens/HomeScreen.tsx
import React, { useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useOfflineStore } from '../store/offlineStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { formatAmount, getInitials } from '../utils'
import type { Book } from '../types'

export default function HomeScreen({ navigation }: any) {
  const { books, isLoading, fetchBooks, deleteBook } = useBooksStore()
  const { user } = useAuthStore()
  const { isOnline, pendingQueue } = useOfflineStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)
  const [refreshing, setRefreshing] = useState(false)

  useFocusEffect(useCallback(() => { fetchBooks() }, []))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchBooks()
    setRefreshing(false)
  }

  const handleLongPress = (book: Book) => {
    const options: any[] = [{ text: 'Cancel', style: 'cancel' }]
    if (book.role === 'owner') {
      options.push({ text: 'Edit', onPress: () => navigation.navigate('CreateBook', { book }) })
      options.push({
        text: 'Delete', style: 'destructive',
        onPress: () => Alert.alert(
          `Delete "${book.name}"?`,
          'All entries will be permanently deleted.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete', style: 'destructive', onPress: async () => {
                const { error } = await deleteBook(book.id)
                if (error) Alert.alert('Error', error)
              }
            },
          ]
        ),
      })
    }
    Alert.alert(book.name, 'Choose an action', options)
  }

  const totalBalance = books.reduce((s, b) => s + (b.balance || 0), 0)

  const renderHeader = () => (
    <View>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.greeting, { color: theme.textSecondary }]}>
            Good {getGreeting()},
          </Text>
          <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
            {user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there'}
          </Text>
        </View>
        {/* Avatar — tapping navigates to Settings tab */}
        {/* commented because it's not needed */}
        {/* <TouchableOpacity
          style={styles.avatarBtn}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.85}
        >
          <LinearGradient colors={['#5B5FED', '#7C3AED']} style={styles.avatarGrad}>
            <Text style={styles.avatarInitial}>
              {getInitials(user?.full_name || user?.email || '?')}
            </Text>
          </LinearGradient>
        </TouchableOpacity> */}
      </View>

      {/*  balance card */}
      {/* commented because it's not needed */}
      {/* <LinearGradient
        colors={['#5B5FED', '#7C3AED']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.balanceCard}
      >
        <View style={styles.balanceCardDeco1} />
        <View style={styles.balanceCardDeco2} />
        <Text style={styles.balanceLabel}>Total Net Balance</Text>
        <Text style={styles.balanceAmount}>
          {totalBalance >= 0 ? '+' : ''}
          {formatAmount(Math.abs(totalBalance))}s
        </Text>
        <View style={styles.balanceMeta}>
          <View style={styles.balanceMetaItem}>
            <Ionicons name="albums-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.balanceMetaText}>
              {books.length} book{books.length !== 1 ? 's' : ''}
            </Text>
          </View>
          {!isOnline && (
            <View style={styles.offlinePill}>
              <Ionicons name="cloud-offline-outline" size={13} color="rgba(255,255,255,0.9)" />
              <Text style={styles.offlinePillText}>
                {pendingQueue.length > 0 ? `${pendingQueue.length} pending` : 'Offline'}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient> */}

      {/* Section header */}
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>My Books</Text>
        <View style={styles.sectionCount}>
          <Text style={styles.sectionCountText}>{books.length}</Text>
        </View>
      </View>
    </View>
  )

  const renderBook = ({ item: book }: { item: Book }) => {
    const isPositive = (book.balance || 0) >= 0
    return (
      <Pressable
        style={({ pressed }) => [
          styles.bookCard,
          { backgroundColor: theme.surface },
          pressed && styles.bookCardPressed,
        ]}
        onPress={() => navigation.navigate('BookDetail', { bookId: book.id, bookName: book.name })}
        onLongPress={() => handleLongPress(book)}
      >
        <View style={[styles.bookAccent, { backgroundColor: book.color }]} />
        <View style={styles.bookBody}>
          <View style={styles.bookTop}>
            <View style={[styles.bookIcon, { backgroundColor: book.color + '18' }]}>
              <Ionicons name="book-outline" size={20} color={book.color} />
            </View>
            <View style={styles.bookInfo}>
              <Text style={[styles.bookName, { color: theme.text }]} numberOfLines={1}>
                {book.name}
              </Text>
              <View style={styles.bookMetaRow}>
                {book.role === 'owner'
                  ? <><Ionicons name="star" size={11} color={COLORS.warning} /><Text style={[styles.bookMetaText, { color: theme.textTertiary }]}> Owner</Text></>
                  : <><Ionicons name="person-outline" size={11} color={theme.textTertiary} /><Text style={[styles.bookMetaText, { color: theme.textTertiary }]}> Member</Text></>
                }
                <Text style={[styles.bookMetaDot, { color: theme.textTertiary }]}> · </Text>
                <Ionicons name="people-outline" size={11} color={theme.textTertiary} />
                <Text style={[styles.bookMetaText, { color: theme.textTertiary }]}> {book.member_count || 1}</Text>
              </View>
            </View>
            <View style={[
              styles.balancePill,
              { backgroundColor: isPositive ? COLORS.cashInLight : COLORS.cashOutLight },
            ]}>
              <Text style={[
                styles.balancePillText,
                { color: isPositive ? COLORS.cashIn : COLORS.cashOut },
              ]}>
                {isPositive ? '+' : '-'}{formatAmount(Math.abs(book.balance || 0), book.currency)}
              </Text>
            </View>
          </View>

          <View style={[styles.statsRow, { borderTopColor: theme.border }]}>
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: COLORS.cashIn }]} />
              <Text style={[styles.statLabel, { color: theme.textTertiary }]}>In </Text>
              <Text style={[styles.statVal, { color: COLORS.cashIn }]}>
                {formatAmount(book.cash_in || 0, book.currency)}
              </Text>
            </View>
            <View style={[styles.statSep, { backgroundColor: theme.border }]} />
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: COLORS.cashOut }]} />
              <Text style={[styles.statLabel, { color: theme.textTertiary }]}>Out </Text>
              <Text style={[styles.statVal, { color: COLORS.cashOut }]}>
                {formatAmount(book.cash_out || 0, book.currency)}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.textTertiary}
              style={{ marginLeft: 'auto' }}
            />
          </View>
        </View>
      </Pressable>
    )
  }

  const renderEmpty = () => (
    <View style={styles.empty}>
      <LinearGradient colors={[COLORS.primaryLight, theme.background]} style={styles.emptyIcon}>
        <Ionicons name="albums-outline" size={40} color={COLORS.primary} />
      </LinearGradient>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>No books yet</Text>
      <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
        Tap the + button to create your first book and start tracking cash flow.
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {isLoading && books.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={b => b.id}
          renderItem={renderBook}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateBook')}
        activeOpacity={0.9}
      >
        <LinearGradient colors={['#5B5FED', '#7C3AED']} style={styles.fabGrad}>
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 110 },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.lg,
  },
  greeting: { fontSize: FONT_SIZE.sm },
  userName: { fontSize: FONT_SIZE.xl, fontWeight: '800', maxWidth: 220 },
  avatarBtn: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', ...SHADOW.sm },
  avatarGrad: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontWeight: '800', fontSize: FONT_SIZE.lg },

  balanceCard: {
    marginHorizontal: SPACING.lg, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl, marginBottom: SPACING.lg, overflow: 'hidden', ...SHADOW.lg,
  },
  balanceCardDeco1: {
    position: 'absolute', width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.07)', top: -60, right: -40,
  },
  balanceCardDeco2: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.05)', bottom: -30, right: 60,
  },
  balanceLabel: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginBottom: 6 },
  balanceAmount: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: SPACING.md },
  balanceMeta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  balanceMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  balanceMetaText: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.75)' },
  offlinePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },
  offlinePillText: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm,
  },
  sectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', flex: 1 },
  sectionCount: {
    backgroundColor: COLORS.primaryLight, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 10,
  },
  sectionCountText: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.primary },

  bookCard: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg, marginBottom: 10,
    borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', ...SHADOW.sm,
  },
  bookCardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  bookAccent: { width: 4 },
  bookBody: { flex: 1, padding: SPACING.md },
  bookTop: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  bookIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm },
  bookInfo: { flex: 1 },
  bookName: { fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: 2 },
  bookMetaRow: { flexDirection: 'row', alignItems: 'center' },
  bookMetaText: { fontSize: FONT_SIZE.xs },
  bookMetaDot: { fontSize: FONT_SIZE.xs },
  balancePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  balancePillText: { fontSize: FONT_SIZE.xs, fontWeight: '700' },

  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: SPACING.sm, borderTopWidth: 1,
  },
  statItem: { flexDirection: 'row', alignItems: 'center' },
  statDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statLabel: { fontSize: FONT_SIZE.xs },
  statVal: { fontSize: FONT_SIZE.xs, fontWeight: '700' },
  statSep: { width: 1, height: 12, marginHorizontal: SPACING.md },

  empty: { alignItems: 'center', paddingTop: SPACING.xl, paddingHorizontal: SPACING.xl },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', marginBottom: SPACING.sm },
  emptyBody: { fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 22 },

  fab: { position: 'absolute', bottom: SPACING.xl, right: SPACING.lg, borderRadius: 30, overflow: 'hidden', ...SHADOW.lg },
  fabGrad: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
})