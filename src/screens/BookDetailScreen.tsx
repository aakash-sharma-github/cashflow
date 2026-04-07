// src/screens/BookDetailScreen.tsx
import React, { useEffect, useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { useEntriesStore } from '../store/entriesStore'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useEntriesRealtime } from '../hooks/useEntriesRealtime'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { formatAmount, formatEntryDate, truncate } from '../utils'
import type { Entry, EntryFilter } from '../types'

const FILTER_TABS: { key: EntryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cash_in', label: 'Cash In' },
  { key: 'cash_out', label: 'Cash Out' },
]

export default function BookDetailScreen({ route, navigation }: any) {
  const { bookId } = route.params
  const [refreshing, setRefreshing] = useState(false)

  const { entries, isLoading, isLoadingMore, filter, summary, fetchEntries, loadMore, deleteEntry, setFilter } = useEntriesStore()
  const { currentBook, fetchBook } = useBooksStore()
  const { user } = useAuthStore()

  // Enable realtime updates
  useEntriesRealtime(bookId)

  useFocusEffect(
    useCallback(() => {
      fetchEntries(bookId)
      fetchBook(bookId)
    }, [bookId])
  )

  useEffect(() => {
    navigation.setOptions({
      title: currentBook?.name || 'Book',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginRight: SPACING.md }}>
          <TouchableOpacity onPress={() => navigation.navigate('ExportImport', { bookId, bookName: currentBook?.name })}>
            <Text style={{ fontSize: 20 }}>⬇️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Members', { bookId, bookName: currentBook?.name })}>
            <Text style={{ fontSize: 20 }}>👥</Text>
          </TouchableOpacity>
        </View>
      ),
    })
  }, [currentBook])

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchEntries(bookId), fetchBook(bookId)])
    setRefreshing(false)
  }

  const handleDeleteEntry = (entry: Entry) => {
    Alert.alert(
      'Delete Entry',
      `Delete ${entry.type === 'cash_in' ? 'Cash In' : 'Cash Out'} of ${formatAmount(entry.amount, currentBook?.currency)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteEntry(entry.id, bookId)
            if (error) Alert.alert('Error', error)
          },
        },
      ]
    )
  }

  const renderEntry = ({ item: entry }: { item: Entry }) => {
    const isCashIn = entry.type === 'cash_in'
    const isMyEntry = entry.user_id === user?.id

    return (
      <TouchableOpacity
        style={styles.entryCard}
        onPress={() => navigation.navigate('AddEditEntry', {
          bookId,
          entry,
          currency: currentBook?.currency,
        })}
        onLongPress={() => handleDeleteEntry(entry)}
        activeOpacity={0.8}
      >
        <View style={[styles.entryTypeIcon, {
          backgroundColor: isCashIn ? COLORS.cashInLight : COLORS.cashOutLight,
        }]}>
          <Text style={styles.entryTypeEmoji}>{isCashIn ? '↑' : '↓'}</Text>
        </View>

        <View style={styles.entryMiddle}>
          <Text style={styles.entryNote} numberOfLines={1}>
            {entry.note || (isCashIn ? 'Cash In' : 'Cash Out')}
          </Text>
          <Text style={styles.entryMeta}>
            {formatEntryDate(entry.entry_date)}
            {!isMyEntry && entry.profile && ` · ${entry.profile.full_name || entry.profile.email}`}
          </Text>
        </View>

        <Text style={[
          styles.entryAmount,
          { color: isCashIn ? COLORS.cashIn : COLORS.cashOut }
        ]}>
          {isCashIn ? '+' : '-'}{formatAmount(entry.amount, currentBook?.currency)}
        </Text>
      </TouchableOpacity>
    )
  }

  const renderSummary = () => {
    const balance = summary?.balance || 0
    const isPositive = balance >= 0

    return (
      <View style={[styles.summaryCard, { backgroundColor: isPositive ? COLORS.cashIn : COLORS.cashOut }]}>
        <Text style={styles.summaryLabel}>Net Balance</Text>
        <Text style={styles.summaryBalance}>
          {formatAmount(Math.abs(balance), currentBook?.currency)}
        </Text>
        <Text style={styles.summarySubLabel}>
          {isPositive ? 'You\'re in the green 🎉' : 'You\'re in the red ⚠️'}
        </Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryItemLabel}>↑ Cash In</Text>
            <Text style={styles.summaryItemValue}>
              {formatAmount(summary?.cash_in || 0, currentBook?.currency)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryItemLabel}>↓ Cash Out</Text>
            <Text style={styles.summaryItemValue}>
              {formatAmount(summary?.cash_out || 0, currentBook?.currency)}
            </Text>
          </View>
        </View>
      </View>
    )
  }

  const renderFilters = () => (
    <View style={styles.filterRow}>
      {FILTER_TABS.map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
          onPress={() => setFilter(tab.key, bookId)}
          activeOpacity={0.7}
        >
          <Text style={[styles.filterLabel, filter === tab.key && styles.filterLabelActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>📋</Text>
      <Text style={styles.emptyTitle}>No entries yet</Text>
      <Text style={styles.emptySubtitle}>
        Tap the + button to add your first entry.
      </Text>
    </View>
  )

  const renderFooter = () => {
    if (!isLoadingMore) return null
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isLoading && entries.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={e => e.id}
          renderItem={renderEntry}
          ListHeaderComponent={
            <View>
              {renderSummary()}
              {renderFilters()}
              <Text style={styles.sectionTitle}>Transactions</Text>
            </View>
          }
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={() => loadMore(bookId)}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddEditEntry', { bookId, currency: currentBook?.currency })}
        activeOpacity={0.9}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 120 },

  summaryCard: {
    margin: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOW.lg,
  },
  summaryLabel: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginBottom: 4 },
  summaryBalance: { fontSize: FONT_SIZE['4xl'], fontWeight: '800', color: '#fff', letterSpacing: -1 },
  summarySubLabel: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.7)', marginBottom: SPACING.lg, marginTop: 4 },
  summaryRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: BORDER_RADIUS.md, padding: SPACING.md },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryItemLabel: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.75)', marginBottom: 2 },
  summaryItemValue: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: SPACING.md },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  filterTab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  filterTabActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.textSecondary },
  filterLabelActive: { color: '#fff' },

  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.textTertiary,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    ...SHADOW.sm,
  },
  entryTypeIcon: {
    width: 40, height: 40,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  entryTypeEmoji: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  entryMiddle: { flex: 1 },
  entryNote: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  entryMeta: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  entryAmount: { fontSize: FONT_SIZE.md, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: SPACING.xl },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  emptySubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, textAlign: 'center' },

  footerLoader: { paddingVertical: SPACING.lg, alignItems: 'center' },

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
