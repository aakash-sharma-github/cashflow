// src/screens/NotificationsScreen.tsx
import React, { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { invitationsService } from '../services/invitationsService'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { formatRelativeTime, getInitials } from '../utils'
import type { Invitation } from '../types'

export default function NotificationsScreen({ navigation }: any) {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const loadInvitations = async () => {
    const { data } = await invitationsService.getMyInvitations()
    setInvitations(data || [])
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { loadInvitations() }, []))

  const onRefresh = async () => {
    setRefreshing(true)
    await loadInvitations()
    setRefreshing(false)
  }

  const handleAccept = async (invitation: Invitation) => {
    setProcessingId(invitation.id)
    const { error } = await invitationsService.acceptInvitation(invitation.id)
    setProcessingId(null)

    if (error) {
      Alert.alert('Error', error)
      return
    }

    setInvitations(prev => prev.filter(i => i.id !== invitation.id))
    Alert.alert('Joined! 🎉', `You've joined "${invitation.book?.name}". It's now in your books list.`)
  }

  const handleReject = async (invitation: Invitation) => {
    Alert.alert(
      'Decline Invitation',
      `Decline the invitation to "${invitation.book?.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setProcessingId(invitation.id)
            const { error } = await invitationsService.rejectInvitation(invitation.id)
            setProcessingId(null)

            if (error) {
              Alert.alert('Error', error)
              return
            }

            setInvitations(prev => prev.filter(i => i.id !== invitation.id))
          },
        },
      ]
    )
  }

  const renderInvitation = ({ item }: { item: Invitation }) => {
    const isProcessing = processingId === item.id

    return (
      <View style={styles.card}>
        {/* Book color accent */}
        <View style={[styles.cardAccent, { backgroundColor: item.book?.color || COLORS.primary }]} />

        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <View style={[styles.bookIcon, { backgroundColor: (item.book?.color || COLORS.primary) + '20' }]}>
              <Text style={styles.bookIconText}>
                {getInitials(item.book?.name || '?')}
              </Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.bookName}>{item.book?.name}</Text>
              <Text style={styles.inviterText}>
                from <Text style={styles.inviterName}>
                  {item.inviter?.full_name || item.inviter?.email || 'Someone'}
                </Text>
              </Text>
              <Text style={styles.timeText}>{formatRelativeTime(item.created_at)}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.rejectBtn, isProcessing && { opacity: 0.5 }]}
              onPress={() => handleReject(item)}
              disabled={isProcessing}
            >
              <Text style={styles.rejectBtnText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.acceptBtn, isProcessing && { opacity: 0.5 }]}
              onPress={() => handleAccept(item)}
              disabled={isProcessing}
            >
              {isProcessing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.acceptBtnText}>Accept</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }

  const renderEmpty = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>🔔</Text>
      <Text style={styles.emptyTitle}>All caught up!</Text>
      <Text style={styles.emptySubtitle}>
        No pending invitations.{'\n'}When someone invites you to a book, it'll show up here.
      </Text>
    </View>
  )

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {invitations.length > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{invitations.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={i => i.id}
          renderItem={renderInvitation}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={[styles.list, invitations.length === 0 && styles.listEmpty]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  headerTitle: {
    fontSize: FONT_SIZE['2xl'],
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  badge: {
    backgroundColor: COLORS.cashOut,
    borderRadius: BORDER_RADIUS.full,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: FONT_SIZE.xs, fontWeight: '800' },

  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },
  listEmpty: { flex: 1 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    overflow: 'hidden',
    ...SHADOW.md,
  },
  cardAccent: { width: 4 },
  cardContent: { flex: 1, padding: SPACING.md },
  cardTop: { flexDirection: 'row', marginBottom: SPACING.md },
  bookIcon: {
    width: 48, height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  bookIconText: { fontWeight: '800', fontSize: FONT_SIZE.md, color: COLORS.text },
  cardInfo: { flex: 1 },
  bookName: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  inviterText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginBottom: 2 },
  inviterName: { fontWeight: '600', color: COLORS.text },
  timeText: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },

  actions: { flexDirection: 'row', gap: SPACING.sm },
  rejectBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  rejectBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.textSecondary },
  acceptBtn: {
    flex: 2,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    ...SHADOW.sm,
  },
  acceptBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#fff' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 56, marginBottom: SPACING.lg },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  emptySubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22 },
})
