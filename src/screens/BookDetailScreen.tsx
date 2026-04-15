// src/screens/BookDetailScreen.tsx
import React, { useEffect, useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useEntriesStore } from '../store/entriesStore'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { useEntriesRealtime } from '../hooks/useEntriesRealtime'
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOW } from '../constants'
import { themedAlert, themedActionSheet } from '../components/common/ThemedAlert'
import { formatAmount } from '../utils'
import { format, isToday, isYesterday } from 'date-fns'
import type { Entry, EntryFilter } from '../types'

// ── Group entries by date ────────────────────────────────────
function groupByDate(entries: Entry[]): { title: string; data: Entry[] }[] {
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

function formatDateLabel(dateStr: string): string {
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
          <Text style={{ fontSize: FONT_SIZE.xs, color: theme.textTertiary }}>
            {currentBook?.currency || ''}
          </Text>
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
        { text: 'Edit Entry', onPress: () => navigation.navigate('AddEditEntry', { bookId, entry: e, currency: currentBook?.currency }) },
        {
          text: 'Delete Entry', style: 'destructive' as const,
          onPress: () => themedAlert(
            'Delete Entry',
            `Remove ${formatAmount(e.amount, currentBook?.currency)}${e.note ? ` "${e.note}"` : ''}?`,
            [{ text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete', style: 'destructive', onPress: async () => {
                const { error } = await deleteEntry(e.id, bookId)
                if (error) themedAlert('Error', error)
              }
            }],
            'trash-outline'),
        },
        { text: 'Cancel', style: 'cancel' as const },
      ]
    )
  }

  const bal = summary?.balance ?? 0
  const groups = groupByDate(entries)

  const renderEntry = (e: Entry, isLast: boolean) => {
    const isCashIn = e.type === 'cash_in'
    const isMe = e.user_id === user?.id
    const entryBy = e.profile?.full_name || e.profile?.email
    const timeStr = format(new Date(e.entry_date), 'h:mm a')

    return (
      <View key={e.id}>
        <Pressable
          style={({ pressed }) => [s.entryRow, pressed && { opacity: 0.82 }]}
          onPress={() => navigation.navigate('AddEditEntry', { bookId, entry: e, currency: currentBook?.currency })}
        >
          {/* Type badge */}
          {/* <View style={[s.typeBadge, {
            backgroundColor: isCashIn ? COLORS.cashInLight : COLORS.cashOutLight,
          }]}>
            <Text style={[s.typeBadgeText, { color: isCashIn ? COLORS.cashIn : COLORS.cashOut }]}>
              {isCashIn ? 'IN' : 'OUT'}
            </Text>
          </View> */}

          {/* Content */}
          <View style={s.entryContent}>
            <Text style={[s.entryAmt, { color: isCashIn ? COLORS.cashIn : COLORS.cashOut }]}>
              {formatAmount(e.amount, currentBook?.currency)}
            </Text>
            {e.note ? (
              <Text style={[s.entryNote, { color: theme.text }]} numberOfLines={1}>{e.note}</Text>
            ) : null}
            <View style={s.entryMeta}>
              {!isMe && entryBy ? (
                <Text style={[s.entryByText, { color: COLORS.primary }]}>Entry by {entryBy}  </Text>
              ) : null}
              <Text style={[s.entryTime, { color: theme.textTertiary }]}>at {timeStr}</Text>
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
        {/* Row separator inside card */}
        {!isLast && <View style={[s.entrySep, { backgroundColor: theme.border }]} />}
      </View>
    )
  }

  if (isLoading && entries.length === 0) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
        <View style={s.loader}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* ── Balance card — rounded like Settings ──── */}
        <View style={[s.balanceCard, { backgroundColor: theme.surface }]}>
          <Text style={[s.balanceLabel, { color: theme.textSecondary }]}>Net Balance</Text>
          <Text style={[s.balanceVal, { color: bal >= 0 ? COLORS.cashIn : COLORS.cashOut }]}>
            {formatAmount(Math.abs(bal), currentBook?.currency)}
          </Text>
          <View style={[s.balanceDivider, { backgroundColor: theme.border }]} />
          <View style={s.balanceRow}>
            <View style={s.balanceItem}>
              <Text style={[s.balanceItemLabel, { color: theme.textSecondary }]}>Total In (+)</Text>
              <Text style={[s.balanceItemVal, { color: COLORS.cashIn }]}>
                {formatAmount(summary?.cash_in || 0, currentBook?.currency)}
              </Text>
            </View>
            <View style={[s.balanceMidLine, { backgroundColor: theme.border }]} />
            <View style={s.balanceItem}>
              <Text style={[s.balanceItemLabel, { color: theme.textSecondary }]}>Total Out (-)</Text>
              <Text style={[s.balanceItemVal, { color: COLORS.cashOut }]}>
                {formatAmount(summary?.cash_out || 0, currentBook?.currency)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Filter tabs — in their own rounded card ── */}
        <View style={[s.filterCard, { backgroundColor: theme.surface }]}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterTab, filter === f.key && { borderBottomColor: COLORS.primary, borderBottomWidth: 2 }]}
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
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </Text>
        </View>

        {/* ── Entry groups — each date group is its own rounded card ── */}
        {entries.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={44} color={theme.textTertiary} />
            <Text style={[s.emptyTitle, { color: theme.text }]}>No entries yet</Text>
            <Text style={[s.emptyBody, { color: theme.textSecondary }]}>Tap + to add your first entry</Text>
          </View>
        ) : (
          groups.map(group => (
            <View key={group.title}>
              {/* Date label above each group card */}
              <Text style={[s.dateLabel, { color: theme.textTertiary }]}>
                {formatDateLabel(group.title)}
              </Text>
              {/* All entries for this date in one rounded card */}
              <View style={[s.entryGroupCard, { backgroundColor: theme.surface }]}>
                {group.data.map((e, idx) => renderEntry(e, idx === group.data.length - 1))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB */}
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
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 100 },

  // ── Balance card ─────────────────────────────────────────
  balanceCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,   // ← rounded, same as Settings
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  balanceLabel: { fontSize: FONT_SIZE.sm, marginBottom: 4 },
  balanceVal: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: SPACING.md },
  balanceDivider: { height: StyleSheet.hairlineWidth, marginBottom: SPACING.md },
  balanceRow: { flexDirection: 'row', alignItems: 'center' },
  balanceItem: { flex: 1 },
  balanceItemLabel: { fontSize: FONT_SIZE.xs, marginBottom: 2 },
  balanceItemVal: { fontSize: FONT_SIZE.md, fontWeight: '700' },
  balanceMidLine: { width: StyleSheet.hairlineWidth, height: 32, marginHorizontal: SPACING.lg },

  // ── Filter card ──────────────────────────────────────────
  filterCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,   // ← rounded
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  filterTab: { paddingVertical: SPACING.md, marginRight: SPACING.md },
  filterTabText: { fontSize: FONT_SIZE.sm },
  entryCount: { marginLeft: 'auto', fontSize: FONT_SIZE.xs, paddingVertical: SPACING.md },

  // ── Date label above each group ──────────────────────────
  dateLabel: {
    paddingHorizontal: SPACING.lg + SPACING.sm,
    paddingVertical: 6,
    fontSize: FONT_SIZE.xs, fontWeight: '600',
  },

  // ── Entry group card — ONE card per date group ───────────
  entryGroupCard: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,   // ← rounded, same curve as Settings
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  entryRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
  },
  // Separator inside the group card
  entrySep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: SPACING.md + 38 + SPACING.sm,
  },

  typeBadge: {
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: BORDER_RADIUS.sm, marginRight: SPACING.sm, marginTop: 2,
    minWidth: 36, alignItems: 'center',
  },
  typeBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  entryContent: { flex: 1 },
  entryAmt: { fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: 2 },
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