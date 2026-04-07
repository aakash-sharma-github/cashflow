// src/screens/MembersScreen.tsx
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { invitationsService } from '../services/invitationsService'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useBookMembersRealtime } from '../hooks/useEntriesRealtime'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { isValidEmail, getInitials, getDisplayName, formatRelativeTime } from '../utils'
import type { BookMember, Invitation } from '../types'

type TabKey = 'members' | 'invitations'

export default function MembersScreen({ route, navigation }: any) {
  const { bookId, bookName } = route.params
  const { currentBook } = useBooksStore()
  const { user } = useAuthStore()

  const [activeTab, setActiveTab] = useState<TabKey>('members')
  const [members, setMembers] = useState<BookMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [sending, setSending] = useState(false)

  const isOwner = currentBook?.role === 'owner'

  const loadData = useCallback(async () => {
    const [membersRes, invitesRes] = await Promise.all([
      invitationsService.getBookMembers(bookId),
      invitationsService.getBookInvitations(bookId),
    ])
    if (membersRes.data) setMembers(membersRes.data)
    if (invitesRes.data) setInvitations(invitesRes.data)
    setLoading(false)
  }, [bookId])

  useEffect(() => { loadData() }, [loadData])

  // Realtime member updates
  useBookMembersRealtime(bookId, loadData)

  const onRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  const handleSendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!isValidEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.')
      return
    }
    if (email === user?.email) {
      Alert.alert('Oops', 'You cannot invite yourself.')
      return
    }

    setSending(true)
    const { error } = await invitationsService.sendInvitation(bookId, email, bookName || 'Book')
    setSending(false)

    if (error) {
      Alert.alert('Could Not Send', error)
      return
    }

    setInviteEmail('')
    await loadData()
    Alert.alert('Invitation Sent! 🎉', `${email} will receive an email with instructions.`)
  }

  const handleRemoveMember = (member: BookMember) => {
    if (member.role === 'owner') return
    Alert.alert(
      'Remove Member',
      `Remove ${getDisplayName(member.profile)} from this book?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error } = await invitationsService.removeMember(bookId, member.user_id)
            if (error) Alert.alert('Error', error)
            else await loadData()
          },
        },
      ]
    )
  }

  const handleCancelInvite = async (invitationId: string) => {
    const { error } = await invitationsService.cancelInvitation(invitationId)
    if (error) Alert.alert('Error', error)
    else await loadData()
  }

  const renderMember = ({ item }: { item: BookMember }) => (
    <TouchableOpacity
      style={styles.memberCard}
      onLongPress={() => isOwner && item.role !== 'owner' && handleRemoveMember(item)}
      activeOpacity={0.8}
    >
      <View style={[styles.avatar, { backgroundColor: COLORS.primary + '20' }]}>
        <Text style={styles.avatarText}>
          {getInitials(item.profile?.full_name || item.profile?.email || '?')}
        </Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName}>
          {getDisplayName(item.profile)}
          {item.user_id === user?.id ? ' (You)' : ''}
        </Text>
        <Text style={styles.memberEmail}>{item.profile?.email}</Text>
      </View>
      <View style={[
        styles.roleBadge,
        { backgroundColor: item.role === 'owner' ? COLORS.primaryLight : COLORS.surfaceSecondary }
      ]}>
        <Text style={[
          styles.roleText,
          { color: item.role === 'owner' ? COLORS.primary : COLORS.textSecondary }
        ]}>
          {item.role === 'owner' ? '👑 Owner' : 'Member'}
        </Text>
      </View>
    </TouchableOpacity>
  )

  const renderInvitation = ({ item }: { item: Invitation }) => {
    const statusColors: Record<string, { bg: string; text: string }> = {
      pending: { bg: COLORS.primaryLight, text: COLORS.primary },
      accepted: { bg: COLORS.cashInLight, text: COLORS.cashIn },
      rejected: { bg: COLORS.cashOutLight, text: COLORS.cashOut },
    }
    const colors = statusColors[item.status] || statusColors.pending

    return (
      <View style={styles.inviteCard}>
        <View style={[styles.avatar, { backgroundColor: COLORS.border }]}>
          <Text style={styles.avatarText}>{getInitials(item.invitee_email)}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.invitee_email}</Text>
          <Text style={styles.memberEmail}>Sent {formatRelativeTime(item.created_at)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
          <View style={[styles.roleBadge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.roleText, { color: colors.text }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
          {item.status === 'pending' && isOwner && (
            <TouchableOpacity onPress={() => handleCancelInvite(item.id)}>
              <Text style={{ color: COLORS.cashOut, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Invite Form (owner only) */}
      {isOwner && (
        <View style={styles.inviteForm}>
          <Text style={styles.inviteTitle}>Invite by Email</Text>
          <View style={styles.inviteRow}>
            <TextInput
              style={styles.inviteInput}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="colleague@example.com"
              placeholderTextColor={COLORS.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.inviteBtn, sending && { opacity: 0.6 }]}
              onPress={handleSendInvite}
              disabled={sending}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.inviteBtnText}>Send</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['members', 'invitations'] as TabKey[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {tab === 'members' ? `Members (${members.length})` : `Invitations (${invitations.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={COLORS.primary} /></View>
      ) : activeTab === 'members' ? (
        <FlatList
          data={members}
          keyExtractor={m => m.id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={i => i.id}
          renderItem={renderInvitation}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 40 }}>✉️</Text>
              <Text style={styles.emptyText}>No invitations sent yet</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  inviteForm: {
    backgroundColor: COLORS.surface,
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...SHADOW.sm,
  },
  inviteTitle: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  inviteRow: { flexDirection: 'row', gap: SPACING.sm },
  inviteInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  inviteBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBtnText: { color: '#fff', fontWeight: '700', fontSize: FONT_SIZE.sm },

  tabRow: { flexDirection: 'row', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, gap: SPACING.sm },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.textSecondary },
  tabLabelActive: { color: '#fff' },

  list: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },

  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOW.sm,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOW.sm,
  },
  avatar: {
    width: 44, height: 44,
    borderRadius: BORDER_RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: { fontWeight: '800', fontSize: FONT_SIZE.md, color: COLORS.primary },
  memberInfo: { flex: 1 },
  memberName: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.text },
  memberEmail: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary, marginTop: 2 },
  roleBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  roleText: { fontSize: FONT_SIZE.xs, fontWeight: '700' },

  emptyState: { alignItems: 'center', paddingTop: SPACING['2xl'], gap: SPACING.md },
  emptyText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
})
