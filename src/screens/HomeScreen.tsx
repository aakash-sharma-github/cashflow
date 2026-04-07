// src/screens/HomeScreen.tsx
import React, { useEffect, useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { formatAmount, getInitials } from '../utils'
import type { Book } from '../types'

export default function HomeScreen({ navigation }: any) {
  const { books, isLoading, fetchBooks, deleteBook } = useBooksStore()
  const { user, signOut } = useAuthStore()
  const [refreshing, setRefreshing] = useState(false)

  useFocusEffect(
    useCallback(() => {
      fetchBooks()
    }, [])
  )

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchBooks()
    setRefreshing(false)
  }

  const handleDeleteBook = (book: Book) => {
    if (book.role !== 'owner') {
      Alert.alert('Permission Denied', 'Only the book owner can delete it.')
      return
    }
    Alert.alert(
      `Delete "${book.name}"?`,
      'All entries will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteBook(book.id)
            if (error) Alert.alert('Error', error)
          },
        },
      ]
    )
  }

  const renderBook = ({ item: book }: { item: Book }) => {
    const isPositive = (book.balance || 0) >= 0
    return (
      <TouchableOpacity
        style={styles.bookCard}
        onPress={() => navigation.navigate('BookDetail', { bookId: book.id, bookName: book.name })}
        onLongPress={() => handleDeleteBook(book)}
        activeOpacity={0.8}
      >
        {/* Color accent */}
        <View style={[styles.bookAccent, { backgroundColor: book.color }]} />

        <View style={styles.bookContent}>
          <View style={styles.bookTop}>
            <View style={styles.bookIconRow}>
              <View style={[styles.bookIcon, { backgroundColor: book.color + '20' }]}>
                <Text style={styles.bookIconText}>
                  {getInitials(book.name)}
                </Text>
              </View>
              <View style={styles.bookMeta}>
                <Text style={styles.bookName} numberOfLines={1}>{book.name}</Text>
                <Text style={styles.bookRole}>
                  {book.role === 'owner' ? '👑 Owner' : '👤 Member'} · {book.member_count || 1} member{(book.member_count || 1) > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <View style={[
              styles.balanceBadge,
              { backgroundColor: isPositive ? COLORS.cashInLight : COLORS.cashOutLight }
            ]}>
              <Text style={[
                styles.balanceText,
                { color: isPositive ? COLORS.cashIn : COLORS.cashOut }
              ]}>
                {isPositive ? '+' : '-'}{formatAmount(Math.abs(book.balance || 0), book.currency)}
              </Text>
            </View>
          </View>

          <View style={styles.bookStats}>
            <View style={styles.statItem}>
              <View style={styles.statDot} />
              <Text style={styles.statLabel}>In </Text>
              <Text style={[styles.statValue, { color: COLORS.cashIn }]}>
                {formatAmount(book.cash_in || 0, book.currency)}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={[styles.statDot, { backgroundColor: COLORS.cashOut }]} />
              <Text style={styles.statLabel}>Out </Text>
              <Text style={[styles.statValue, { color: COLORS.cashOut }]}>
                {formatAmount(book.cash_out || 0, book.currency)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📚</Text>
      <Text style={styles.emptyTitle}>No books yet</Text>
      <Text style={styles.emptySubtitle}>
        Create your first book to start tracking cash flow.
      </Text>
    </View>
  )

  const renderHeader = () => (
    <View style={styles.header}>
      <View>
        <Text style={styles.greeting}>
          Hey, {user?.full_name?.split(' ')[0] || 'there'} 👋
        </Text>
        <Text style={styles.headerTitle}>Your Books</Text>
      </View>
      <TouchableOpacity
        style={styles.profileBtn}
        onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: signOut },
        ])}
      >
        <Text style={styles.profileInitial}>
          {getInitials(user?.full_name || user?.email || '?')}
        </Text>
      </TouchableOpacity>
    </View>
  )

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}

      {isLoading && books.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={b => b.id}
          renderItem={renderBook}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateBook')}
        activeOpacity={0.9}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  greeting: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginBottom: 2 },
  headerTitle: { fontSize: FONT_SIZE['2xl'], fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  profileBtn: {
    width: 40, height: 40,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.md },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 120 },
  bookCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    overflow: 'hidden',
    ...SHADOW.md,
  },
  bookAccent: { width: 4, minHeight: 100 },
  bookContent: { flex: 1, padding: SPACING.md },
  bookTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.md },
  bookIconRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: SPACING.sm },
  bookIcon: {
    width: 40, height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  bookIconText: { fontWeight: '800', fontSize: FONT_SIZE.sm, color: COLORS.text },
  bookMeta: { flex: 1 },
  bookName: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  bookRole: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  balanceBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  balanceText: { fontSize: FONT_SIZE.sm, fontWeight: '700' },
  bookStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  statItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  statDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.cashIn, marginRight: 4 },
  statLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  statValue: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  statDivider: { width: 1, height: 16, backgroundColor: COLORS.border, marginHorizontal: SPACING.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 56, marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  emptySubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
  fab: {
    position: 'absolute',
    bottom: SPACING.xl,
    right: SPACING.lg,
    width: 60, height: 60,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.lg,
  },
  fabIcon: { fontSize: 28, color: '#fff', lineHeight: 32 },
})
