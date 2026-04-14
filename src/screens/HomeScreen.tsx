// src/screens/HomeScreen.tsx — Redesigned: minimal, CashBook-inspired
import React, { useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useOfflineStore } from '../store/offlineStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { COLORS, SPACING, FONT_SIZE } from '../constants'
import { themedAlert, themedActionSheet } from '../components/common/ThemedAlert'
import { formatAmount, getInitials } from '../utils'
import type { Book } from '../types'

export default function HomeScreen({ navigation }: any) {
  const { books, isLoading, fetchBooks, deleteBook } = useBooksStore()
  const { user } = useAuthStore()
  const { isOnline } = useOfflineStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)
  const [refreshing, setRefreshing] = useState(false)

  useFocusEffect(useCallback(() => { fetchBooks() }, []))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchBooks()
    setRefreshing(false)
  }

  const handleThreeDot = (book: Book) => {
    const currentUser = useAuthStore.getState().user
    const isOwner = book.role === 'owner' || book.owner_id === currentUser?.id
    if (!isOwner) return

    themedActionSheet(book.name, undefined, [
      {
        text: 'Edit Book',
        onPress: () => navigation.navigate('CreateBook', { book }),
      },
      {
        text: 'Delete Book',
        style: 'destructive' as const,
        onPress: () => themedAlert(
          `Delete "${book.name}"?`,
          'All entries will be permanently removed. This cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete', style: 'destructive',
              onPress: async () => {
                const { error } = await deleteBook(book.id)
                if (error) themedAlert('Delete Failed', error)
              },
            },
          ],
          'trash-outline',
        ),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ])
  }

  // ── Book icon letters from name ──────────────────────────────
  const bookInitials = (name: string) => name.slice(0, 2).toUpperCase()

  const renderBook = ({ item: book }: { item: Book }) => {
    const isPositive = (book.balance || 0) >= 0
    const hasMembers = (book.member_count || 1) > 1

    return (
      <Pressable
        style={({ pressed }) => [s.row, { backgroundColor: theme.surface }, pressed && { opacity: 0.85 }]}
        onPress={() => navigation.navigate('BookDetail', { bookId: book.id, bookName: book.name })}
      >
        {/* Book icon */}
        <View style={[s.bookIconWrap, { backgroundColor: COLORS.primaryLight }]}>
          <Text style={s.bookIconText}>{bookInitials(book.name)}</Text>
        </View>

        {/* Name + meta */}
        <View style={s.rowMid}>
          <Text style={[s.rowName, { color: theme.text }]} numberOfLines={1}>
            {book.name}
          </Text>
          <View style={s.rowMeta}>
            {hasMembers && (
              <View style={s.metaItem}>
                <Ionicons name="people-outline" size={12} color={theme.textTertiary} />
                <Text style={[s.metaText, { color: theme.textTertiary }]}>
                  {' '}{book.member_count} Members ·{' '}
                </Text>
              </View>
            )}
            <Text style={[s.metaText, { color: theme.textTertiary }]}>
              {book.currency}
            </Text>
          </View>
        </View>

        {/* Balance */}
        <Text style={[
          s.rowBalance,
          { color: isPositive ? COLORS.cashIn : COLORS.cashOut },
        ]}>
          {isPositive ? '' : '-'}{formatAmount(Math.abs(book.balance || 0), book.currency)}
        </Text>

        {/* Three-dot */}
        <TouchableOpacity
          onPress={() => handleThreeDot(book)}
          style={s.dotBtn}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={theme.textTertiary} />
        </TouchableOpacity>

        {/* Row separator */}
      </Pressable>
    )
  }

  const totalBalance = books.reduce((s, b) => s + (b.balance || 0), 0)
  const totalIn = books.reduce((s, b) => s + (b.cash_in || 0), 0)
  const totalOut = books.reduce((s, b) => s + (b.cash_out || 0), 0)

  const ListHeader = () => (
    <View>
      {/* Top bar — business name + icons */}
      <View style={[s.topBar, { borderBottomColor: theme.border }]}>
        <View style={s.topLeft}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={[s.avatarSmall, { backgroundColor: COLORS.primaryLight }]}
          >
            <Text style={s.avatarSmallText}>
              {getInitials(user?.full_name || user?.email || '?')}
            </Text>
          </TouchableOpacity>
          <View>
            <Text style={[s.businessName, { color: theme.text }]} numberOfLines={1}>
              {user?.full_name || user?.email?.split('@')[0] || 'My Business'}
            </Text>
            <Text style={[s.businessSub, { color: theme.textTertiary }]}>
              {books.length} book{books.length !== 1 ? 's' : ''}
              {!isOnline ? ' · Offline' : ''}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={s.topIconBtn}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Ionicons name="person-add-outline" size={22} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Balance summary panel */}
      {/* <View style={[s.summaryPanel, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={s.summaryMain}>
          <Text style={[s.summaryLabel, { color: theme.textSecondary }]}>Net Balance</Text>
          <Text style={[s.summaryBalance, {
            color: totalBalance >= 0 ? COLORS.cashIn : COLORS.cashOut,
          }]}>
            {totalBalance >= 0 ? '' : '-'}{formatAmount(Math.abs(totalBalance))}
          </Text>
        </View>
        <View style={[s.summaryDivider, { backgroundColor: theme.border }]} />
        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <Text style={[s.summaryItemLabel, { color: theme.textTertiary }]}>Total In (+)</Text>
            <Text style={[s.summaryItemVal, { color: COLORS.cashIn }]}>
              {formatAmount(totalIn)}
            </Text>
          </View>
          <View style={s.summaryItem}>
            <Text style={[s.summaryItemLabel, { color: theme.textTertiary }]}>Total Out (-)</Text>
            <Text style={[s.summaryItemVal, { color: COLORS.cashOut }]}>
              {formatAmount(totalOut)}
            </Text>
          </View>
        </View>
      </View> */}

      {/* Section title */}
      <View style={s.sectionRow}>
        <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>Your Books</Text>
        <View style={s.sectionRight}>
          <Ionicons name="funnel-outline" size={16} color={theme.textTertiary} style={{ marginRight: 12 }} />
          <Ionicons name="search-outline" size={16} color={theme.textTertiary} />
        </View>
      </View>
    </View>
  )

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
      {isLoading && books.length === 0 ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={b => b.id}
          renderItem={renderBook}
          ListHeaderComponent={<ListHeader />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="book-outline" size={48} color={theme.textTertiary} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>No books yet</Text>
              <Text style={[s.emptyBody, { color: theme.textSecondary }]}>
                Tap + to create your first book
              </Text>
            </View>
          }
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={[s.separator, { backgroundColor: theme.border }]} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: COLORS.primary }]}
        onPress={() => navigation.navigate('CreateBook')}
        activeOpacity={0.88}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 100 },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  topIconBtn: { padding: 4 },
  avatarSmall: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarSmallText: { color: COLORS.primary, fontWeight: '800', fontSize: FONT_SIZE.sm },
  businessName: { fontSize: FONT_SIZE.md, fontWeight: '700', maxWidth: 200 },
  businessSub: { fontSize: FONT_SIZE.xs, marginTop: 1 },

  // Summary panel (like CashBook's balance section)
  summaryPanel: { padding: SPACING.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryMain: { marginBottom: SPACING.md },
  summaryLabel: { fontSize: FONT_SIZE.sm, marginBottom: 4 },
  summaryBalance: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  summaryDivider: { height: StyleSheet.hairlineWidth, marginBottom: SPACING.md },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1 },
  summaryItemLabel: { fontSize: FONT_SIZE.xs, marginBottom: 2 },
  summaryItemVal: { fontSize: FONT_SIZE.md, fontWeight: '700' },

  // Section header
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  sectionTitle: { fontSize: FONT_SIZE.sm, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionRight: { flexDirection: 'row', alignItems: 'center' },

  // Book row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: SPACING.lg + 44 + SPACING.sm },
  bookIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  bookIconText: { color: COLORS.primary, fontWeight: '800', fontSize: FONT_SIZE.md },
  rowMid: { flex: 1 },
  rowName: { fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: 3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center' },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: FONT_SIZE.xs },
  rowBalance: { fontSize: FONT_SIZE.md, fontWeight: '700', marginRight: SPACING.sm },
  dotBtn: { paddingLeft: SPACING.sm },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', marginTop: SPACING.sm },
  emptyBody: { fontSize: FONT_SIZE.sm, textAlign: 'center' },

  // FAB
  fab: {
    position: 'absolute', bottom: SPACING.xl, right: SPACING.lg,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#5B5FED', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
})