// src/screens/NotificationsScreen.tsx
import React, { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { invitationsService } from '../services/invitationsService'
import { useThemeStore, getTheme } from '../store/themeStore'
import { useInboxStore } from '../store/inboxStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { formatRelativeTime } from '../utils'
import type { Invitation } from '../types'
import {
  themedAlert,
  themedActionSheet,
} from "../components/common/ThemedAlert";

export default function NotificationsScreen() {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const { mode } = useThemeStore()
  const theme = getTheme(mode)
  const { setUnreadCount } = useInboxStore()

  const load = async () => {
    const { data } = await invitationsService.getMyInvitations()
    setInvitations(data || [])
    setUnreadCount(data?.length ?? 0)  // keep badge in sync
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { load() }, []))
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

  const handleAccept = async (inv: Invitation) => {
    setProcessingId(inv.id)
    const { error } = await invitationsService.acceptInvitation(inv.id)
    setProcessingId(null)
    if (error) {
      themedAlert("Error:", error);
      return;
    }

    setInvitations(p => p.filter(i => i.id !== inv.id))
    // Alert.alert('Joined! 🎉', `You've joined "${inv.book?.name}"`)
    themedAlert('Joined! 🎉', `You've joined "${inv.book?.name}"`);
  }

  const handleReject = (inv: Invitation) => {
    // Alert.alert('Decline', `Decline invite to "${inv.book?.name}"?`, [
    //   { text: 'Cancel', style: 'cancel' },
    //   {
    //     text: 'Decline', style: 'destructive', onPress: async () => {
    //       setProcessingId(inv.id)
    //       const { error } = await invitationsService.rejectInvitation(inv.id)
    //       setProcessingId(null)
    //       if (error) Alert.alert('Error', error)
    //       else setInvitations(p => p.filter(i => i.id !== inv.id))
    //     },
    //   },
    // ])
    themedAlert('Decline', `Decline invite to "${inv.book?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive', onPress: async () => {
          setProcessingId(inv.id)
          const { error } = await invitationsService.rejectInvitation(inv.id)
          setProcessingId(null)
          if (error) themedAlert('Error:', error);
          else setInvitations(p => p.filter(i => i.id !== inv.id))
        },
      },
    ]);
  }

  const renderItem = ({ item }: { item: Invitation }) => {
    const isProc = processingId === item.id
    const bookColor = item.book?.color || COLORS.primary
    return (
      <View style={[s.card, { backgroundColor: theme.surface }]}>
        <View style={[s.cardAccent, { backgroundColor: bookColor }]} />
        <View style={s.cardBody}>
          <View style={s.cardTop}>
            <View style={[s.bookIconWrap, { backgroundColor: bookColor + '18' }]}>
              <Ionicons name="book-outline" size={22} color={bookColor} />
            </View>
            <View style={s.cardInfo}>
              <Text style={[s.bookName, { color: theme.text }]}>{item.book?.name}</Text>
              <Text style={[s.fromText, { color: theme.textSecondary }]}>
                From{' '}
                <Text style={[s.inviterName, { color: theme.text }]}>
                  {item.inviter?.full_name || item.inviter?.email || 'Someone'}
                </Text>
              </Text>
              <View style={s.timeRow}>
                <Ionicons name="time-outline" size={11} color={theme.textTertiary} />
                <Text style={[s.timeText, { color: theme.textTertiary }]}>
                  {' '}{formatRelativeTime(item.created_at)}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.actions}>
            <TouchableOpacity
              style={[s.rejectBtn, { borderColor: theme.border, backgroundColor: theme.background }]}
              onPress={() => handleReject(item)}
              disabled={isProc}
            >
              <Ionicons name="close-outline" size={16} color={theme.textSecondary} />
              <Text style={[s.rejectText, { color: theme.textSecondary }]}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.acceptBtn, isProc && { opacity: 0.6 }]}
              onPress={() => handleAccept(item)}
              disabled={isProc}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#5B5FED', '#7C3AED']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.acceptGrad}
              >
                {isProc
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="checkmark-outline" size={16} color="#fff" /><Text style={s.acceptText}>Accept</Text></>
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={[s.title, { color: theme.text }]}>Inbox</Text>
        {invitations.length > 0 && (
          <LinearGradient colors={['#FF647C', '#E84560']} style={s.badge}>
            <Text style={s.badgeText}>{invitations.length}</Text>
          </LinearGradient>
        )}
      </View>

      {loading ? (
        <View style={s.loader}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={[s.list, !invitations.length && s.listFlex]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <LinearGradient colors={[COLORS.primaryLight, theme.background]} style={s.emptyIcon}>
                <Ionicons name="notifications-outline" size={40} color={COLORS.primary} />
              </LinearGradient>
              <Text style={[s.emptyTitle, { color: theme.text }]}>All caught up!</Text>
              <Text style={[s.emptySub, { color: theme.textSecondary }]}>
                Pending invites will appear here.
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.lg,
  },
  title: { fontSize: FONT_SIZE['2xl'], fontWeight: '800', letterSpacing: -0.5 },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: '800' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },
  listFlex: { flex: 1 },

  card: {
    flexDirection: 'row', borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md, overflow: 'hidden', ...SHADOW.sm,
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: SPACING.md },
  cardTop: { flexDirection: 'row', marginBottom: SPACING.md },
  bookIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md,
  },
  cardInfo: { flex: 1 },
  bookName: { fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: 2 },
  fromText: { fontSize: FONT_SIZE.sm, marginBottom: 2 },
  inviterName: { fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: FONT_SIZE.xs },

  actions: { flexDirection: 'row', gap: SPACING.sm },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 10, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5,
  },
  rejectText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  acceptBtn: { flex: 2, borderRadius: BORDER_RADIUS.md, overflow: 'hidden' },
  acceptGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 5,
  },
  acceptText: { fontSize: FONT_SIZE.sm, color: '#fff', fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', marginBottom: SPACING.sm },
  emptySub: { fontSize: FONT_SIZE.sm, textAlign: 'center' },
})