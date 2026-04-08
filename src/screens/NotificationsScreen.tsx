// src/screens/NotificationsScreen.tsx — Redesigned v2
import React, { useState, useCallback } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { invitationsService } from '../services/invitationsService'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { formatRelativeTime } from '../utils'
import type { Invitation } from '../types'

export default function NotificationsScreen({ navigation }: any) {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const load = async () => {
    const { data } = await invitationsService.getMyInvitations()
    setInvitations(data || [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { load() }, []))
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

  const handleAccept = async (inv: Invitation) => {
    setProcessingId(inv.id)
    const { error } = await invitationsService.acceptInvitation(inv.id)
    setProcessingId(null)
    if (error) { Alert.alert('Error', error); return }
    setInvitations(p => p.filter(i => i.id !== inv.id))
    Alert.alert('Joined! 🎉', `You've joined "${inv.book?.name}"`)
  }

  const handleReject = (inv: Invitation) => {
    Alert.alert('Decline', `Decline invite to "${inv.book?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: async () => {
        setProcessingId(inv.id)
        const { error } = await invitationsService.rejectInvitation(inv.id)
        setProcessingId(null)
        if (error) Alert.alert('Error', error)
        else setInvitations(p => p.filter(i => i.id !== inv.id))
      }},
    ])
  }

  const renderItem = ({ item }: { item: Invitation }) => {
    const isProc = processingId === item.id
    return (
      <View style={styles.card}>
        <View style={[styles.cardAccent, { backgroundColor: item.book?.color || COLORS.primary }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <View style={[styles.bookIconWrap, { backgroundColor: (item.book?.color || COLORS.primary) + '18' }]}>
              <Ionicons name="book-outline" size={22} color={item.book?.color || COLORS.primary} />
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.bookName}>{item.book?.name}</Text>
              <Text style={styles.fromText}>
                From <Text style={styles.inviterName}>{item.inviter?.full_name || item.inviter?.email || 'Someone'}</Text>
              </Text>
              <View style={styles.timeRow}>
                <Ionicons name="time-outline" size={11} color={COLORS.textTertiary} />
                <Text style={styles.timeText}> {formatRelativeTime(item.created_at)}</Text>
              </View>
            </View>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(item)} disabled={isProc}>
              <Ionicons name="close-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.rejectText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(item)} disabled={isProc} activeOpacity={0.85}>
              <LinearGradient colors={['#5B5FED', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.acceptGrad}>
                {isProc ? <ActivityIndicator color="#fff" size="small" /> : (
                  <><Ionicons name="checkmark-outline" size={16} color="#fff" /><Text style={styles.acceptText}>Accept</Text></>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inbox</Text>
        {invitations.length > 0 && (
          <LinearGradient colors={['#FF647C', '#E84560']} style={styles.badge}>
            <Text style={styles.badgeText}>{invitations.length}</Text>
          </LinearGradient>
        )}
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, !invitations.length && styles.listFlex]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <LinearGradient colors={[COLORS.primaryLight, COLORS.background]} style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={40} color={COLORS.primary} />
              </LinearGradient>
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySub}>Pending invites will appear here.</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.lg },
  title: { fontSize: FONT_SIZE['2xl'], fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: '800' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },
  listFlex: { flex: 1 },

  card: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.md,
    overflow: 'hidden', ...SHADOW.sm,
  },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: SPACING.md },
  cardTop: { flexDirection: 'row', marginBottom: SPACING.md },
  bookIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  cardInfo: { flex: 1 },
  bookName: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  fromText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginBottom: 2 },
  inviterName: { fontWeight: '700', color: COLORS.text },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timeText: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },

  actions: { flexDirection: 'row', gap: SPACING.sm },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border,
  },
  rejectText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: '600' },
  acceptBtn: { flex: 2, borderRadius: BORDER_RADIUS.md, overflow: 'hidden' },
  acceptGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 5 },
  acceptText: { fontSize: FONT_SIZE.sm, color: '#fff', fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.sm },
  emptySub: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, textAlign: 'center' },
})
