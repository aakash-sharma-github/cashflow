// src/screens/BookDetailScreen.tsx
import React, { useEffect, useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useEntriesStore } from '../store/entriesStore'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { useEntriesRealtime } from '../hooks/useEntriesRealtime'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { themedAlert, themedActionSheet } from '../components/common/ThemedAlert'
import { formatAmount, formatEntryDate } from '../utils'
import type { Entry, EntryFilter } from '../types'

const FILTERS: { key: EntryFilter; label: string; icon: string }[] = [
  { key: 'all', label: 'All', icon: 'list-outline' },
  { key: 'cash_in', label: 'In', icon: 'arrow-down-outline' },
  { key: 'cash_out', label: 'Out', icon: 'arrow-up-outline' },
]

export default function BookDetailScreen({ route, navigation }: any) {
  const { bookId } = route.params
  const [refreshing, setRefreshing] = useState(false)

  const { entries, isLoading, isLoadingMore, filter, summary, fetchEntries, loadMore, deleteEntry, setFilter } = useEntriesStore()
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
      title: currentBook?.name || 'Book',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 12 }}>
          <TouchableOpacity
            style={[s.hdrBtn, { backgroundColor: COLORS.primaryLight }]}
            onPress={() => navigation.navigate('ExportImport', { bookId, bookName: currentBook?.name })}
          >
            <Ionicons name="download-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.hdrBtn, { backgroundColor: COLORS.primaryLight }]}
            onPress={() => navigation.navigate('Members', { bookId, bookName: currentBook?.name })}
          >
            <Ionicons name="people-outline" size={18} color={COLORS.primary} />
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

  const handleEntryLongPress = (e: Entry) => {
    const isCashIn = e.type === 'cash_in'
    const label = `${isCashIn ? '+ ' : '- '}${formatAmount(e.amount, currentBook?.currency)}`
    themedActionSheet(
      label,
      e.note || (isCashIn ? 'Cash In' : 'Cash Out'),
      [
        {
          text: 'Edit Entry',
          onPress: () => navigation.navigate('AddEditEntry', {
            bookId,
            entry: e,
            currency: currentBook?.currency,
          }),
        },
        {
          text: 'Delete Entry',
          style: 'destructive' as const,
          onPress: () => themedAlert(
            'Delete Entry',
            `Remove ${label}${e.note ? ` "${e.note}"` : ''}? This cannot be undone.`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  const { error } = await deleteEntry(e.id, bookId)
                  if (error) themedAlert('Error', error)
                },
              },
            ],
            'trash-outline'
          ),
        },
        { text: 'Cancel', style: 'cancel' as const },
      ]
    )
  }

  const renderEntry = ({ item: e }: { item: Entry }) => {
    const isCashIn = e.type === 'cash_in'
    const isMe = e.user_id === user?.id
    return (
      <Pressable
        style={({ pressed }) => [s.entryCard, { backgroundColor: theme.surface }, pressed && { opacity: 0.88 }]}
        onPress={() => navigation.navigate('AddEditEntry', { bookId, entry: e, currency: currentBook?.currency })}
        onLongPress={() => handleEntryLongPress(e)}
      >
        <View style={[s.entryIcon, { backgroundColor: isCashIn ? COLORS.cashInLight : COLORS.cashOutLight }]}>
          <Ionicons
            name={isCashIn ? 'arrow-down' : 'arrow-up'}
            size={18}
            color={isCashIn ? COLORS.cashIn : COLORS.cashOut}
          />
        </View>
        <View style={s.entryMid}>
          <Text style={[s.entryNote, { color: theme.text }]} numberOfLines={1}>
            {e.note || (isCashIn ? 'Cash In' : 'Cash Out')}
          </Text>
          <Text style={[s.entryMeta, { color: theme.textTertiary }]}>
            {formatEntryDate(e.entry_date)}
            {!isMe && e.profile ? ` · ${e.profile.full_name || e.profile.email}` : ''}
          </Text>
        </View>
        <Text style={[s.entryAmt, { color: isCashIn ? COLORS.cashIn : COLORS.cashOut }]}>
          {isCashIn ? '+' : '-'}{formatAmount(e.amount, currentBook?.currency)}
        </Text>
      </Pressable>
    )
  }

  const bal = summary?.balance ?? 0
  const pos = bal >= 0

  const ListHeader = () => (
    <View>
      {/* Summary card */}
      <LinearGradient
        colors={pos ? ['#00C48C', '#00A374'] : ['#FF647C', '#E84560']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.summaryCard}
      >
        <View style={s.sumDeco1} /><View style={s.sumDeco2} />
        <Text style={s.sumLabel}>Net Balance</Text>
        <Text style={s.sumBalance}>{formatAmount(Math.abs(bal), currentBook?.currency)}</Text>
        {/* <Text style={s.sumSub}>{pos ? "You're in the green 🎉" : "You're in the red ⚠️"}</Text> */}
        <View style={s.sumRow}>
          <View style={s.sumItem}>
            <Ionicons name="arrow-down" size={14} color="rgba(255,255,255,0.8)" />
            {/* <Text style={s.sumItemLabel}>  Cash In</Text> */}
            <Text style={s.sumItemVal}>{formatAmount(summary?.cash_in || 0, currentBook?.currency)}</Text>
          </View>
          <View style={s.sumDiv} />
          <View style={s.sumItem}>
            <Ionicons name="arrow-up" size={14} color="rgba(255,255,255,0.8)" />
            {/* <Text style={s.sumItemLabel}>  Cash Out</Text> */}
            <Text style={s.sumItemVal}>{formatAmount(summary?.cash_out || 0, currentBook?.currency)}</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Filters */}
      <View style={s.filterRow}>
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <TouchableOpacity
              key={f.key}
              style={[
                s.filterTab,
                { backgroundColor: theme.surface, borderColor: theme.border },
                active && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
              ]}
              onPress={() => setFilter(f.key, bookId)}
              activeOpacity={0.75}
            >
              <Ionicons name={f.icon as any} size={14} color={active ? '#fff' : theme.textSecondary} />
              <Text style={[s.filterLabel, { color: active ? '#fff' : theme.textSecondary }]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {entries.length > 0 && (
        <Text style={[s.sectionTitle, { color: theme.textTertiary }]}>Transactions</Text>
      )}
    </View>
  )

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      {isLoading && entries.length === 0 ? (
        <View style={s.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={e => e.id}
          renderItem={renderEntry}
          ListHeaderComponent={<ListHeader />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="receipt-outline" size={48} color={theme.textTertiary} />
              <Text style={[s.emptyTitle, { color: theme.text }]}>No transactions yet</Text>
              <Text style={[s.emptySub, { color: theme.textSecondary }]}>Tap + to add your first entry</Text>
            </View>
          }
          ListFooterComponent={
            isLoadingMore
              ? <ActivityIndicator style={{ padding: 20 }} color={COLORS.primary} />
              : null
          }
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onEndReached={() => loadMore(bookId)}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        />
      )}

      <TouchableOpacity
        style={s.fab}
        onPress={() => navigation.navigate('AddEditEntry', { bookId, currency: currentBook?.currency })}
        activeOpacity={0.9}
      >
        <LinearGradient colors={['#5B5FED', '#7C3AED']} style={s.fabGrad}>
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 110 },
  hdrBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  summaryCard: { margin: SPACING.lg, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, overflow: 'hidden', ...SHADOW.lg },
  sumDeco1: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)', top: -50, right: -30 },
  sumDeco2: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.06)', bottom: -20, right: 80 },
  sumLabel: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginBottom: 4 },
  sumBalance: { fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 4 },
  sumSub: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.7)', marginBottom: SPACING.lg },
  sumRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 14, padding: SPACING.md },
  sumItem: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  sumItemLabel: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.75)', flex: 1 },
  sumItemVal: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff', marginTop: 2 },
  sumDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: SPACING.md },

  filterRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.md },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1.5,
  },
  filterLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  sectionTitle: { fontSize: FONT_SIZE.xs, fontWeight: '700', paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 1 },

  entryCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.lg, marginBottom: 8, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, ...SHADOW.sm },
  entryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  entryMid: { flex: 1 },
  entryNote: { fontSize: FONT_SIZE.md, fontWeight: '600', marginBottom: 2 },
  entryMeta: { fontSize: FONT_SIZE.xs },
  entryAmt: { fontSize: FONT_SIZE.md, fontWeight: '800' },

  empty: { alignItems: 'center', paddingTop: SPACING['2xl'], gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700' },
  emptySub: { fontSize: FONT_SIZE.sm },

  fab: { position: 'absolute', bottom: SPACING.xl, right: SPACING.lg, borderRadius: 30, overflow: 'hidden', ...SHADOW.lg },
  fabGrad: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
})