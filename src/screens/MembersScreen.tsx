// src/screens/MembersScreen.tsx — Redesigned v2
import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  TextInput, ActivityIndicator, Alert, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { invitationsService } from '../services/invitationsService'
import { useBooksStore } from '../store/booksStore'
import { useAuthStore } from '../store/authStore'
import { useBookMembersRealtime } from '../hooks/useEntriesRealtime'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { isValidEmail, getInitials, getDisplayName, formatRelativeTime } from '../utils'
import type { BookMember, Invitation } from '../types'

type TabKey = 'members' | 'invitations'

export default function MembersScreen({ route }: any) {
  const { bookId } = route.params
  const { currentBook } = useBooksStore()
  const { user } = useAuthStore()

  const [tab, setTab] = useState<TabKey>('members')
  const [members, setMembers] = useState<BookMember[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [emailFocused, setEmailFocused] = useState(false)
  const [sending, setSending] = useState(false)

  const isOwner = currentBook?.role === 'owner'

  const load = useCallback(async () => {
    const [mRes, iRes] = await Promise.all([
      invitationsService.getBookMembers(bookId),
      invitationsService.getBookInvitations(bookId),
    ])
    if (mRes.data) setMembers(mRes.data)
    if (iRes.data) setInvitations(iRes.data)
    setLoading(false)
  }, [bookId])

  useEffect(() => { load() }, [load])
  useBookMembersRealtime(bookId, load)

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false) }

  const handleSendInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!isValidEmail(email)) { Alert.alert('Invalid Email', 'Please enter a valid email.'); return }
    if (email === user?.email) { Alert.alert('Oops', 'You cannot invite yourself.'); return }
    setSending(true)
    const { error } = await invitationsService.sendInvitation(bookId, email, currentBook?.name || 'Book')
    setSending(false)
    if (error) { Alert.alert('Could Not Send', error); return }
    setInviteEmail('')
    await load()
    Alert.alert('Invitation Sent! 🎉', `${email} will receive an email invite.`)
  }

  const handleRemoveMember = (m: BookMember) => {
    Alert.alert('Remove Member', `Remove ${getDisplayName(m.profile)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await invitationsService.removeMember(bookId, m.user_id)
        if (error) Alert.alert('Error', error)
        else load()
      }},
    ])
  }

  const statusConfig: Record<string, { bg: string; text: string; icon: string }> = {
    pending:  { bg: COLORS.primaryLight,  text: COLORS.primary,  icon: 'time-outline' },
    accepted: { bg: COLORS.cashInLight,   text: COLORS.cashIn,   icon: 'checkmark-circle-outline' },
    rejected: { bg: COLORS.cashOutLight,  text: COLORS.cashOut,  icon: 'close-circle-outline' },
  }

  const renderMember = ({ item: m }: { item: BookMember }) => (
    <TouchableOpacity
      style={styles.row}
      onLongPress={() => isOwner && m.role !== 'owner' && handleRemoveMember(m)}
      activeOpacity={0.85}
    >
      <View style={styles.avatarWrap}>
        <LinearGradient
          colors={m.role === 'owner' ? ['#5B5FED', '#7C3AED'] : ['#9CA3AF', '#6B7280']}
          style={styles.avatarGrad}
        >
          <Text style={styles.avatarText}>{getInitials(m.profile?.full_name || m.profile?.email || '?')}</Text>
        </LinearGradient>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>
          {getDisplayName(m.profile)}{m.user_id === user?.id ? ' (You)' : ''}
        </Text>
        <Text style={styles.rowEmail}>{m.profile?.email}</Text>
      </View>
      <View style={[styles.rolePill, { backgroundColor: m.role === 'owner' ? COLORS.primaryLight : COLORS.surfaceSecondary }]}>
        {m.role === 'owner' && <Ionicons name="star" size={11} color={COLORS.primary} />}
        <Text style={[styles.roleText, { color: m.role === 'owner' ? COLORS.primary : COLORS.textSecondary }]}>
          {m.role === 'owner' ? ' Owner' : 'Member'}
        </Text>
      </View>
    </TouchableOpacity>
  )

  const renderInvite = ({ item: inv }: { item: Invitation }) => {
    const cfg = statusConfig[inv.status] || statusConfig.pending
    return (
      <View style={styles.row}>
        <View style={[styles.avatarWrap]}>
          <View style={[styles.avatarGrad, { backgroundColor: COLORS.border, borderRadius: 22 }]}>
            <Text style={[styles.avatarText, { color: COLORS.textSecondary }]}>
              {getInitials(inv.invitee_email)}
            </Text>
          </View>
        </View>
        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>{inv.invitee_email}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="time-outline" size={11} color={COLORS.textTertiary} />
            <Text style={styles.rowEmail}>{formatRelativeTime(inv.created_at)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
          <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon as any} size={11} color={cfg.text} />
            <Text style={[styles.statusText, { color: cfg.text }]}>
              {' '}{inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
            </Text>
          </View>
          {inv.status === 'pending' && isOwner && (
            <TouchableOpacity onPress={async () => {
              await invitationsService.cancelInvitation(inv.id); load()
            }}>
              <Ionicons name="close-circle-outline" size={20} color={COLORS.cashOut} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Invite bar — owner only */}
      {isOwner && (
        <View style={styles.inviteBar}>
          <Text style={styles.inviteLabel}>
            <Ionicons name="person-add-outline" size={13} color={COLORS.textSecondary} />  Invite by Email
          </Text>
          <View style={styles.inviteRow}>
            <View style={[styles.inviteInputWrap, emailFocused && styles.inviteInputFocused]}>
              <Ionicons name="mail-outline" size={16} color={emailFocused ? COLORS.primary : COLORS.textTertiary} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.inviteInput}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="colleague@example.com"
                placeholderTextColor={COLORS.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onSubmitEditing={handleSendInvite}
                returnKeyType="send"
              />
            </View>
            <TouchableOpacity
              style={[styles.sendBtn, sending && { opacity: 0.6 }]}
              onPress={handleSendInvite}
              disabled={sending}
            >
              <LinearGradient colors={['#5B5FED', '#7C3AED']} style={styles.sendBtnGrad}>
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Ionicons name="send-outline" size={16} color="#fff" />
                }
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['members', 'invitations'] as TabKey[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Ionicons
              name={t === 'members' ? 'people-outline' : 'mail-outline'}
              size={15}
              color={tab === t ? COLORS.primary : COLORS.textSecondary}
            />
            <Text style={[styles.tabBtnLabel, tab === t && styles.tabBtnLabelActive]}>
              {t === 'members' ? `Members (${members.length})` : `Invites (${invitations.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={COLORS.primary} /></View>
      ) : tab === 'members' ? (
        <FlatList
          data={members}
          keyExtractor={m => m.id}
          renderItem={renderMember}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        />
      ) : (
        <FlatList
          data={invitations}
          keyExtractor={i => i.id}
          renderItem={renderInvite}
          contentContainerStyle={[styles.list, !invitations.length && styles.listFlex]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="mail-open-outline" size={40} color={COLORS.textTertiary} />
              <Text style={styles.emptyText}>No invitations sent yet</Text>
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
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  inviteBar: {
    backgroundColor: COLORS.surface, padding: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  inviteLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  inviteRow: { flexDirection: 'row', gap: SPACING.sm },
  inviteInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, height: 44,
  },
  inviteInputFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  inviteInput: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.text },
  sendBtn: { borderRadius: BORDER_RADIUS.md, overflow: 'hidden' },
  sendBtnGrad: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  tabRow: { flexDirection: 'row', padding: SPACING.md, gap: SPACING.sm },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
  },
  tabBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  tabBtnLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.textSecondary },
  tabBtnLabelActive: { color: COLORS.primary },

  list: { paddingHorizontal: SPACING.md, paddingBottom: 40 },
  listFlex: { flex: 1 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: 8, ...SHADOW.sm,
  },
  avatarWrap: { marginRight: SPACING.md },
  avatarGrad: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: FONT_SIZE.md },
  rowInfo: { flex: 1 },
  rowName: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  rowEmail: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary },
  rolePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  roleText: { fontSize: FONT_SIZE.xs, fontWeight: '700' },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: FONT_SIZE.xs, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: SPACING['2xl'], gap: SPACING.md },
  emptyText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary },
})
