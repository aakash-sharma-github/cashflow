// src/screens/BookDetailScreen.tsx — Redesigned: minimal, date-grouped entries
import React, { useEffect, useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Pressable, SectionList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useEntriesStore } from '../store/entriesStore'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { useEntriesRealtime } from '../hooks/useEntriesRealtime'
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '../constants'
import { themedAlert, themedActionSheet } from '../components/common/ThemedAlert'
import { formatAmount } from '../utils'
import { format, isToday, isYesterday } from 'date-fns'
import type { Entry, EntryFilter } from '../types'

// ── Group entries by date ────────────────────────────────────
function groupByDate(entries: Entry[]) {
  const groups: Record<string, Entry[]> = {}
  for (const e of entries) {
    const key = format(new Date(e.entry_date), 'yyyy-MM-dd')
    if (!groups[key]) groups[key] = []
    groups[key].push(e)
  }
  return Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .map(key => ({ title: key, data: groups[key] }))
}

function formatSectionTitle(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return `Today, ${format(d, 'dd MMMM yyyy')}`
  if (isYesterday(d)) return `Yesterday, ${format(d, 'dd MMMM yyyy')}`
  return format(d, 'dd MMMM yyyy')
}

const FILTERS: { key: EntryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'cash_in', label: 'Cash In' },
  { key: 'cash_out', label: 'Cash Out' },
]

export default function BookDetailScreen({ route, navigation }: any) {
  const { bookId } = route.params
  const [refreshing, setRefreshing] = useState(false)

  const { entries, isLoading, filter, summary, fetchEntries, deleteEntry, setFilter } = useEntriesStore()
  const { currentBook, fetchBook } = useBooksStore()
  const { user } = useAuthStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  useEntriesRealtime(bookId)

  useFocusEffect(useCallback(() => {
    fetchEntries(bookId)
    fetchBook(bookId)
  }, [bookId]))

  useEffect(() => {
    navigation.setOptions({
      title: '',
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4, marginLeft: 4 }}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
      ),
      headerTitle: () => (
        <View>
          <Text style={{ fontSize: FONT_SIZE.md, fontWeight: '700', color: theme.text }}>
            {currentBook?.name || 'Book'}
          </Text>
          {currentBook && (
            <Text style={{ fontSize: FONT_SIZE.xs, color: theme.textTertiary }}>
              {/* Show member names if available */}
              {currentBook.currency}
            </Text>
          )}
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <TouchableOpacity
            style={{ padding: 6 }}
            onPress={() => navigation.navigate('ExportImport', { bookId, bookName: currentBook?.name })}
          >
            <Ionicons name="document-text-outline" size={22} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={{ padding: 6 }}
            onPress={() => navigation.navigate('Members', { bookId, bookName: currentBook?.name })}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={theme.text} />
          </TouchableOpacity>
        </View>
      ),
    })
  }, [currentBook, theme])

  const onRefresh = async () => {
    setRefreshing(true)
    await Promise.all([fetchEntries(bookId), fetchBook(bookId)])
    setRefreshing(false)
  }

  const handleEntryThreeDot = (e: Entry) => {
    const isCashIn = e.type === 'cash_in'
    themedActionSheet(
      e.note || (isCashIn ? 'Cash In' : 'Cash Out'),
      formatAmount(e.amount, currentBook?.currency),
      [
        {
          text: 'Edit Entry',
          onPress: () => navigation.navigate('AddEditEntry', {
            bookId, entry: e, currency: currentBook?.currency,
          }),
        },
        {
          text: 'Delete Entry',
          style: 'destructive' as const,
          onPress: () => themedAlert(
            'Delete Entry',
            `Remove ${formatAmount(e.amount, currentBook?.currency)}${e.note ? ` "${e.note}"` : ''}?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete', style: 'destructive',
                onPress: async () => {
                  const { error } = await deleteEntry(e.id, bookId)
                  if (error) themedAlert('Error', error)
                },
              },
            ],
            'trash-outline',
          ),
        },
        { text: 'Cancel', style: 'cancel' as const },
      ]
    )
  }

  const bal = summary?.balance ?? 0
  const sections = groupByDate(entries)

  const renderEntry = ({ item: e }: { item: Entry }) => {
    const isCashIn = e.type === 'cash_in'
    const isMe = e.user_id === user?.id
    const entryBy = e.profile?.full_name || e.profile?.email
    const timeStr = format(new Date(e.entry_date), 'h:mm a')

    return (
      <Pressable
        style={({ pressed }) => [s.entryRow, { backgroundColor: theme.surface }, pressed && { opacity: 0.85 }]}
        onPress={() => navigation.navigate('AddEditEntry', { bookId, entry: e, currency: currentBook?.currency })}
      >
        {/* Type badge */}
        <View style={[
          s.typeBadge,
          { backgroundColor: isCashIn ? '#1a2e1a' : '#2e1a1a' },
        ]}>
          <Text style={[s.typeBadgeText, { color: isCashIn ? COLORS.cashIn : COLORS.cashOut }]}>
            {isCashIn ? 'Cash' : 'Cash'}
          </Text>
        </View>

        {/* Content */}
        <View style={s.entryContent}>
          {/* Amount + balance row */}
          <View style={s.entryTopRow}>
            <Text style={[s.entryAmt, { color: isCashIn ? COLORS.cashIn : COLORS.cashOut }]}>
              {isCashIn ? '+' : ''}{formatAmount(e.amount, currentBook?.currency)}
            </Text>
            {e.running_balance !== undefined && (
              <Text style={[s.entryRunBal, { color: theme.textTertiary }]}>
                Balance: {formatAmount(e.running_balance, currentBook?.currency)}
              </Text>
            )}
          </View>
          {/* Remark */}
          {e.note ? (
            <Text style={[s.entryNote, { color: theme.text }]} numberOfLines={1}>
              {e.note}
            </Text>
          ) : null}
          {/* Entry by + time */}
          <View style={s.entryMeta}>
            {!isMe && entryBy ? (
              <Text style={[s.entryByText, { color: COLORS.primary }]}>
                Entry by {entryBy}{'  '}
              </Text>
            ) : null}
            <Text style={[s.entryTime, { color: theme.textTertiary }]}>
              {isMe ? `at ${timeStr}` : `at ${timeStr}`}
            </Text>
          </View>
        </View>

        {/* Three-dot */}
        <TouchableOpacity
          onPress={() => handleEntryThreeDot(e)}
          style={s.dotBtn}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <Ionicons name="ellipsis-vertical" size={16} color={theme.textTertiary} />
        </TouchableOpacity>
      </Pressable>
    )
  }

  const renderSectionHeader = ({ section }: any) => (
    <View style={[s.sectionHeader, { backgroundColor: theme.background }]}>
      <Text style={[s.sectionHeaderText, { color: theme.textTertiary }]}>
        {formatSectionTitle(section.title)}
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      {/* Balance panel */}
      <View style={[s.balancePanel, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={s.balancePanelRow}>
          <View style={s.balancePanelItem}>
            <Text style={[s.balancePanelLabel, { color: theme.textSecondary }]}>Net Balance</Text>
            <Text style={[s.balancePanelVal, {
              color: bal >= 0 ? COLORS.cashIn : COLORS.cashOut,
            }]}>
              {bal >= 0 ? '' : '-'}{formatAmount(Math.abs(bal), currentBook?.currency)}
            </Text>
          </View>
        </View>
        <View style={[s.balanceDivider, { backgroundColor: theme.border }]} />
        <View style={s.balanceSubRow}>
          <View style={s.balanceSubItem}>
            <Text style={[s.balanceSubLabel, { color: theme.textSecondary }]}>Total In (+)</Text>
            <Text style={[s.balanceSubVal, { color: COLORS.cashIn }]}>
              {formatAmount(summary?.cash_in || 0, currentBook?.currency)}
            </Text>
          </View>
          <View style={s.balanceSubItem}>
            <Text style={[s.balanceSubLabel, { color: theme.textSecondary }]}>Total Out (-)</Text>
            <Text style={[s.balanceSubVal, { color: COLORS.cashOut }]}>
              {formatAmount(summary?.cash_out || 0, currentBook?.currency)}
            </Text>
          </View>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={[s.filterRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[
              s.filterTab,
              filter === f.key && { borderBottomColor: COLORS.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setFilter(f.key, bookId)}
          >
            <Text style={[
              s.filterTabText,
              { color: filter === f.key ? COLORS.primary : theme.textSecondary },
              filter === f.key && { fontWeight: '700' },
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={[s.entryCount, { color: theme.textTertiary }]}>
          Showing {entries.length} entries
        </Text>
      </View>

      {/* Entry list */}
      {isLoading && entries.length === 0 ? (
        <View style={s.loader}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={e => e.id}
          renderItem={renderEntry}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="receipt-outline" size={44} color={theme.textTertiary} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>No entries yet</Text>
              <Text style={[s.emptyBody, { color: theme.textSecondary }]}>
                Tap + to add your first entry
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        />
      )}

      {/* Single + FAB */}
      <TouchableOpacity
        style={[s.fab, { backgroundColor: COLORS.primary }]}
        onPress={() => navigation.navigate('AddEditEntry', { bookId, currency: currentBook?.currency })}
        activeOpacity={0.88}
      >
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  list: { paddingBottom: 100 },

  // Balance panel
  balancePanel: { padding: SPACING.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  balancePanelRow: { marginBottom: SPACING.md },
  balancePanelItem: {},
  balancePanelLabel: { fontSize: FONT_SIZE.sm, marginBottom: 4 },
  balancePanelVal: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  balanceDivider: { height: StyleSheet.hairlineWidth, marginBottom: SPACING.md },
  balanceSubRow: { flexDirection: 'row' },
  balanceSubItem: { flex: 1 },
  balanceSubLabel: { fontSize: FONT_SIZE.xs, marginBottom: 2 },
  balanceSubVal: { fontSize: FONT_SIZE.md, fontWeight: '700' },

  // Filter row
  filterRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.lg,
  },
  filterTab: { paddingVertical: SPACING.sm, marginRight: SPACING.lg },
  filterTabText: { fontSize: FONT_SIZE.sm },
  entryCount: { marginLeft: 'auto', fontSize: FONT_SIZE.xs },

  // Section header
  sectionHeader: { paddingHorizontal: SPACING.lg, paddingVertical: 6 },
  sectionHeaderText: { fontSize: FONT_SIZE.xs, fontWeight: '600' },

  // Entry row
  entryRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  typeBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm, marginRight: SPACING.sm, marginTop: 2,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  entryContent: { flex: 1 },
  entryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 },
  entryAmt: { fontSize: FONT_SIZE.lg, fontWeight: '700' },
  entryRunBal: { fontSize: FONT_SIZE.xs },
  entryNote: { fontSize: FONT_SIZE.sm, marginBottom: 3 },
  entryMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  entryByText: { fontSize: FONT_SIZE.xs, fontWeight: '600' },
  entryTime: { fontSize: FONT_SIZE.xs },
  dotBtn: { padding: 4, paddingLeft: SPACING.sm, marginTop: 2 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 60, gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700' },
  emptyBody: { fontSize: FONT_SIZE.sm },

  // FAB
  fab: {
    position: 'absolute', bottom: SPACING.xl, right: SPACING.lg,
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#5B5FED', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
})