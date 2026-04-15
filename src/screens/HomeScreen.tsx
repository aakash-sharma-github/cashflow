// src/screens/HomeScreen.tsx
import React, { useCallback, useState, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Pressable, TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useOfflineStore } from '../store/offlineStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOW } from '../constants'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActive, setSearchActive] = useState(false)

  useFocusEffect(useCallback(() => { fetchBooks() }, []))

  const onRefresh = async () => {
    setRefreshing(true); await fetchBooks(); setRefreshing(false)
  }

  const filteredBooks = useMemo(() => {
    if (!searchQuery.trim()) return books
    const q = searchQuery.toLowerCase()
    return books.filter(b => b.name.toLowerCase().includes(q))
  }, [books, searchQuery])

  const handleThreeDot = (book: Book) => {
    const u = useAuthStore.getState().user
    if (book.role !== 'owner' && book.owner_id !== u?.id) return
    themedActionSheet(book.name, undefined, [
      { text: 'Edit Book', onPress: () => navigation.navigate('CreateBook', { book }) },
      {
        text: 'Delete Book', style: 'destructive' as const,
        onPress: () => themedAlert(
          `Delete "${book.name}"?`, 'All entries will be permanently removed.',
          [{ text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive', onPress: async () => {
              const { error } = await deleteBook(book.id)
              if (error) themedAlert('Delete Failed', error)
            }
          }],
          'trash-outline'),
      },
      { text: 'Cancel', style: 'cancel' as const },
    ])
  }

  const totalBalance = books.reduce((s, b) => s + (b.balance || 0), 0)
  const totalIn = books.reduce((s, b) => s + (b.cash_in || 0), 0)
  const totalOut = books.reduce((s, b) => s + (b.cash_out || 0), 0)

  if (isLoading && books.length === 0) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
        <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Top bar ─────────────────────────────────── */}
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
                {books.length} book{books.length !== 1 ? 's' : ''}{!isOnline ? ' · Offline' : ''}
              </Text>
            </View>
          </View>
          {/* <TouchableOpacity style={s.topIconBtn} onPress={() => navigation.navigate('Notifications')}>
            <Ionicons name="person-add-outline" size={22} color={theme.text} />
          </TouchableOpacity> */}
        </View>

        {/* ── Summary card — rounded like Settings ─────── */}
        {/* <View style={[s.summaryCard, { backgroundColor: theme.surface }]}>
          <Text style={[s.summaryLabel, { color: theme.textSecondary }]}>Net Balance</Text>
          <Text style={[s.summaryBalance, { color: totalBalance >= 0 ? COLORS.cashIn : COLORS.cashOut }]}>
            {totalBalance >= 0 ? '' : '-'}{formatAmount(Math.abs(totalBalance))}
          </Text>
          <View style={[s.summaryDivider, { backgroundColor: theme.border }]} />
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={[s.summaryItemLabel, { color: theme.textTertiary }]}>Total In (+)</Text>
              <Text style={[s.summaryItemVal, { color: COLORS.cashIn }]}>{formatAmount(totalIn)}</Text>
            </View>
            <View style={[s.summaryMidLine, { backgroundColor: theme.border }]} />
            <View style={s.summaryItem}>
              <Text style={[s.summaryItemLabel, { color: theme.textTertiary }]}>Total Out (-)</Text>
              <Text style={[s.summaryItemVal, { color: COLORS.cashOut }]}>{formatAmount(totalOut)}</Text>
            </View>
          </View>
        </View> */}

        {/* ── Section header + search ──────────────────── */}
        <View style={s.sectionRow}>
          {searchActive ? (
            <View style={[s.searchBar, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
              <Ionicons name="search-outline" size={15} color={theme.textTertiary} />
              <TextInput
                style={[s.searchInput, { color: theme.text }]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search books..."
                placeholderTextColor={theme.textTertiary}
                autoFocus
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={15} color={theme.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>Your Books</Text>
          )}
          <TouchableOpacity
            onPress={() => { if (searchActive) { setSearchQuery(''); setSearchActive(false) } else setSearchActive(true) }}
            style={s.searchToggleBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={searchActive ? 'close' : 'search-outline'}
              size={17}
              color={searchActive ? COLORS.cashOut : theme.textTertiary}
            />
          </TouchableOpacity>
        </View>

        {/* ── Book list — all rows inside ONE rounded card ── */}
        {filteredBooks.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name={searchQuery ? 'search-outline' : 'book-outline'} size={44} color={theme.textTertiary} />
            <Text style={[s.emptyTitle, { color: theme.text }]}>
              {searchQuery ? `No books matching "${searchQuery}"` : 'No books yet'}
            </Text>
            {!searchQuery && <Text style={[s.emptyBody, { color: theme.textSecondary }]}>Tap + to create your first book</Text>}
          </View>
        ) : (
          // This single View IS the rounded card — all rows render inside it
          <View style={[s.bookListCard, { backgroundColor: theme.surface }]}>
            {filteredBooks.map((book, index) => {
              const isPositive = (book.balance || 0) >= 0
              const hasMembers = (book.member_count || 1) > 1
              const isLast = index === filteredBooks.length - 1

              return (
                <View key={book.id}>
                  <Pressable
                    style={({ pressed }) => [s.row, pressed && { opacity: 0.82 }]}
                    onPress={() => navigation.navigate('BookDetail', { bookId: book.id, bookName: book.name })}
                  >
                    {/* Icon */}
                    <View style={[s.bookIconWrap, {
                      backgroundColor: hasMembers ? COLORS.primaryLight : theme.surfaceSecondary,
                    }]}>
                      <Ionicons
                        name={hasMembers ? 'people' : 'book'}
                        size={20}
                        color={hasMembers ? COLORS.primary : theme.textSecondary}
                      />
                    </View>

                    {/* Name + meta */}
                    <View style={s.rowMid}>
                      <Text style={[s.rowName, { color: theme.text }]} numberOfLines={1}>{book.name}</Text>
                      <Text style={[s.metaText, { color: theme.textTertiary }]}>
                        {hasMembers ? `${book.member_count} Members · ` : ''}{book.currency}
                      </Text>
                    </View>

                    {/* Balance */}
                    <Text style={[s.rowBalance, { color: isPositive ? COLORS.cashIn : COLORS.cashOut }]}>
                      {formatAmount(Math.abs(book.balance || 0), book.currency)}
                    </Text>

                    {/* Three-dot */}
                    <TouchableOpacity
                      onPress={() => handleThreeDot(book)}
                      style={s.dotBtn}
                      hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color={theme.textTertiary} />
                    </TouchableOpacity>
                  </Pressable>

                  {/* Separator between rows (not after last) */}
                  {!isLast && (
                    <View style={[s.rowSep, { backgroundColor: theme.border }]} />
                  )}
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>

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
  scroll: { paddingBottom: 100 },

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
  businessName: { fontSize: FONT_SIZE.md, fontWeight: '700', maxWidth: 210 },
  businessSub: { fontSize: FONT_SIZE.xs, marginTop: 1 },

  // ── Summary card ─────────────────────────────────────────
  summaryCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,   // ← rounded corners, matches Settings
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  summaryLabel: { fontSize: FONT_SIZE.sm, marginBottom: 4 },
  summaryBalance: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.md },
  summaryDivider: { height: StyleSheet.hairlineWidth, marginBottom: SPACING.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1 },
  summaryItemLabel: { fontSize: FONT_SIZE.xs, marginBottom: 2 },
  summaryItemVal: { fontSize: FONT_SIZE.md, fontWeight: '700' },
  summaryMidLine: { width: StyleSheet.hairlineWidth, height: 32, marginHorizontal: SPACING.lg },

  // Section header
  sectionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, minHeight: 40,
  },
  sectionTitle: { flex: 1, fontSize: FONT_SIZE.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  searchToggleBtn: { padding: 4, marginLeft: SPACING.sm },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: SPACING.sm, height: 34,
  },
  searchInput: { flex: 1, fontSize: FONT_SIZE.sm, padding: 0 },

  // ── Book list card — ONE rounded card wrapping ALL rows ───
  bookListCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,   // ← same curve as Settings cards
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: 14,
  },
  // Thin line between rows inside the card
  rowSep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SPACING.md + 44 + SPACING.sm,  // indent to align with text
  },

  bookIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm,
  },
  rowMid: { flex: 1 },
  rowName: { fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: 3 },
  metaText: { fontSize: FONT_SIZE.xs },
  rowBalance: { fontSize: FONT_SIZE.md, fontWeight: '700', marginRight: SPACING.sm },
  dotBtn: { paddingLeft: SPACING.sm },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', marginTop: SPACING.sm, textAlign: 'center' },
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