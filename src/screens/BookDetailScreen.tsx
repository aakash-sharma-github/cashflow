// src/screens/BookDetailScreen.tsx — Redesigned v2
import React, { useEffect, useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useEntriesStore } from '../store/entriesStore'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useEntriesRealtime } from '../hooks/useEntriesRealtime'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
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
            style={hdrBtn}
            onPress={() => navigation.navigate('ExportImport', { bookId, bookName: currentBook?.name })}
          >
            <Ionicons name="download-outline" size={18} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={hdrBtn}
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

  const handleDelete = (entry: Entry) => {
    Alert.alert(
      'Delete Entry',
      `Delete ${formatAmount(entry.amount, currentBook?.currency)} ${entry.type === 'cash_in' ? 'Cash In' : 'Cash Out'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await deleteEntry(entry.id, bookId)
          if (error) Alert.alert('Error', error)
        }},
      ]
    )
  }

  const renderEntry = ({ item: e }: { item: Entry }) => {
    const isCashIn = e.type === 'cash_in'
    const isMe = e.user_id === user?.id
    return (
      <Pressable
        style={({ pressed }) => [styles.entryCard, pressed && { opacity: 0.9 }]}
        onPress={() => navigation.navigate('AddEditEntry', { bookId, entry: e, currency: currentBook?.currency })}
        onLongPress={() => handleDelete(e)}
      >
        <View style={[styles.entryIconWrap, { backgroundColor: isCashIn ? COLORS.cashInLight : COLORS.cashOutLight }]}>
          <Ionicons
            name={isCashIn ? 'arrow-down' : 'arrow-up'}
            size={18}
            color={isCashIn ? COLORS.cashIn : COLORS.cashOut}
          />
        </View>
        <View style={styles.entryMid}>
          <Text style={styles.entryNote} numberOfLines={1}>
            {e.note || (isCashIn ? 'Cash In' : 'Cash Out')}
          </Text>
          <Text style={styles.entryMeta}>
            {formatEntryDate(e.entry_date)}
            {!isMe && e.profile ? ` · ${e.profile.full_name || e.profile.email}` : ''}
          </Text>
        </View>
        <Text style={[styles.entryAmt, { color: isCashIn ? COLORS.cashIn : COLORS.cashOut }]}>
          {isCashIn ? '+' : '-'}{formatAmount(e.amount, currentBook?.currency)}
        </Text>
      </Pressable>
    )
  }

  const renderSummaryCard = () => {
    const bal = summary?.balance ?? 0
    const pos = bal >= 0
    return (
      <LinearGradient
        colors={pos ? ['#00C48C', '#00A374'] : ['#FF647C', '#E84560']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.summaryCard}
      >
        <View style={styles.summaryDeco1} />
        <View style={styles.summaryDeco2} />
        <Text style={styles.summaryLabel}>Net Balance</Text>
        <Text style={styles.summaryBalance}>{formatAmount(Math.abs(bal), currentBook?.currency)}</Text>
        <Text style={styles.summarySubLabel}>{pos ? 'You\'re in the green 🎉' : 'You\'re in the red ⚠️'}</Text>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Ionicons name="arrow-down" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.summaryItemLabel}>  Cash In</Text>
            <Text style={styles.summaryItemVal}>{formatAmount(summary?.cash_in || 0, currentBook?.currency)}</Text>
          </View>
          <View style={styles.summaryDiv} />
          <View style={styles.summaryItem}>
            <Ionicons name="arrow-up" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.summaryItemLabel}>  Cash Out</Text>
            <Text style={styles.summaryItemVal}>{formatAmount(summary?.cash_out || 0, currentBook?.currency)}</Text>
          </View>
        </View>
      </LinearGradient>
    )
  }

  const renderFilters = () => (
    <View style={styles.filterRow}>
      {FILTERS.map(f => (
        <TouchableOpacity
          key={f.key}
          style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
          onPress={() => setFilter(f.key, bookId)}
          activeOpacity={0.75}
        >
          <Ionicons
            name={f.icon as any}
            size={14}
            color={filter === f.key ? '#fff' : COLORS.textSecondary}
          />
          <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
            {f.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {isLoading && entries.length === 0 ? (
        <View style={styles.loader}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={e => e.id}
          renderItem={renderEntry}
          ListHeaderComponent={
            <View>
              {renderSummaryCard()}
              {renderFilters()}
              {entries.length > 0 && <Text style={styles.sectionTitle}>Transactions</Text>}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={48} color={COLORS.textTertiary} />
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptySub}>Tap + to add your first entry</Text>
            </View>
          }
          ListFooterComponent={isLoadingMore ? <ActivityIndicator style={{ padding: 20 }} color={COLORS.primary} /> : null}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={() => loadMore(bookId)}
          onEndReachedThreshold={0.3}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AddEditEntry', { bookId, currency: currentBook?.currency })}
        activeOpacity={0.9}
      >
        <LinearGradient colors={['#5B5FED', '#7C3AED']} style={styles.fabGrad}>
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const hdrBtn = {
  width: 34, height: 34, borderRadius: 10,
  backgroundColor: COLORS.primaryLight,
  alignItems: 'center' as const, justifyContent: 'center' as const,
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 110 },

  summaryCard: {
    margin: SPACING.lg, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl, overflow: 'hidden', ...SHADOW.lg,
  },
  summaryDeco1: { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)', top: -50, right: -30 },
  summaryDeco2: { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.06)', bottom: -20, right: 80 },
  summaryLabel: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginBottom: 4 },
  summaryBalance: { fontSize: 38, fontWeight: '900', color: '#fff', letterSpacing: -1, marginBottom: 4 },
  summarySubLabel: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.7)', marginBottom: SPACING.lg },
  summaryRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: 14, padding: SPACING.md },
  summaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  summaryItemLabel: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.75)', flex: 1 },
  summaryItemVal: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff', marginTop: 2 },
  summaryDiv: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: SPACING.md },

  filterRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, gap: SPACING.sm, marginBottom: SPACING.md },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.textSecondary },
  filterLabelActive: { color: '#fff' },

  sectionTitle: {
    fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.textTertiary,
    paddingHorizontal: SPACING.lg, marginBottom: SPACING.sm,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  entryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg, marginBottom: 8,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
    ...SHADOW.sm,
  },
  entryIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  entryMid: { flex: 1 },
  entryNote: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  entryMeta: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  entryAmt: { fontSize: FONT_SIZE.md, fontWeight: '800' },

  empty: { alignItems: 'center', paddingTop: SPACING['2xl'], gap: SPACING.sm },
  emptyTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },

  fab: { position: 'absolute', bottom: SPACING.xl, right: SPACING.lg, borderRadius: 30, overflow: 'hidden', ...SHADOW.lg },
  fabGrad: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
})
