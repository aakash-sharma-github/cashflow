// src/screens/SettingsScreen.tsx
import React, { useEffect, useState, useCallback } from 'react'
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet,
    Switch, Image, Alert, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useAuthStore } from '../store/authStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { invitationsService } from '../services/invitationsService'
import { useBooksStore } from '../store/booksStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { getInitials, getDisplayName } from '../utils'
import type { BookMember } from '../types'
import { APP_VERSION } from '../utils/version'

export default function SettingsScreen({ navigation }: any) {
    const { user, signOut } = useAuthStore()
    const { mode, toggle } = useThemeStore()
    const { books } = useBooksStore()
    const theme = getTheme(mode)
    const isDark = mode === 'dark'

    const [allMembers, setAllMembers] = useState<BookMember[]>([])
    const [loadingMembers, setLoadingMembers] = useState(false)

    useFocusEffect(useCallback(() => {
        loadAllMembers()
    }, [books]))

    const loadAllMembers = async () => {
        if (!books.length) return
        setLoadingMembers(true)
        // Collect all members across all books, deduplicate by user_id,
        // exclude the current user (they see themselves in the Profile section).
        const seen = new Set<string>()
        const unique: BookMember[] = []
        for (const book of books) {
            const { data } = await invitationsService.getBookMembers(book.id)
            if (data) {
                for (const m of data) {
                    // Skip self and skip if already added
                    if (m.user_id === user?.id) continue
                    if (seen.has(m.user_id)) continue
                    seen.add(m.user_id)
                    unique.push(m)
                }
            }
        }
        setAllMembers(unique)
        setLoadingMembers(false)
    }

    const isEmailVerified = !!(user?.email)

    const SectionHeader = ({ title }: { title: string }) => (
        <Text style={[styles.sectionHeader, { color: theme.textTertiary }]}>{title}</Text>
    )

    const SettingRow = ({
        icon, iconBg, iconColor, label, sublabel, onPress, right, danger,
    }: {
        icon: string; iconBg: string; iconColor: string; label: string
        sublabel?: string; onPress?: () => void; right?: React.ReactNode; danger?: boolean
    }) => (
        <TouchableOpacity
            style={[styles.row, { backgroundColor: theme.surface }]}
            onPress={onPress}
            activeOpacity={onPress ? 0.75 : 1}
            disabled={!onPress && !right}
        >
            <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
                <Ionicons name={icon as any} size={18} color={iconColor} />
            </View>
            <View style={styles.rowBody}>
                <Text style={[styles.rowLabel, { color: danger ? COLORS.cashOut : theme.text }]}>{label}</Text>
                {sublabel ? <Text style={[styles.rowSub, { color: theme.textTertiary }]}>{sublabel}</Text> : null}
            </View>
            {right ?? (onPress && <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />)}
        </TouchableOpacity>
    )

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.topBar}>
                <Text style={[styles.pageTitle, { color: theme.text }]}>Settings</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

                {/* ── Profile Section ─────────────────────────── */}
                <SectionHeader title="Your Profile" />
                <TouchableOpacity
                    style={[styles.card, { backgroundColor: theme.surface }]}
                    onPress={() => navigation.navigate('EditProfile')}
                    activeOpacity={0.85}
                >
                    {/* Avatar + name */}
                    <View style={styles.profileRow}>
                        <View style={styles.avatarWrap}>
                            {user?.avatar_url ? (
                                <Image source={{ uri: user.avatar_url }} style={styles.avatarImg} />
                            ) : (
                                <LinearGradient colors={['#5B5FED', '#7C3AED']} style={styles.avatarGrad}>
                                    <Text style={styles.avatarInitial}>
                                        {getInitials(user?.full_name || user?.email || '?')}
                                    </Text>
                                </LinearGradient>
                            )}
                        </View>
                        <View style={styles.profileInfo}>
                            <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
                                {user?.full_name || user?.email?.split('@')[0] || 'Unknown'}
                            </Text>
                            <View style={styles.emailRow}>
                                <Ionicons name="mail-outline" size={13} color={theme.textSecondary} />
                                <Text style={[styles.profileEmail, { color: theme.textSecondary }]} numberOfLines={1}>
                                    {' '}{user?.email}
                                </Text>
                            </View>
                            {/* Verified badge */}
                            <View style={[styles.verifiedBadge, { backgroundColor: isEmailVerified ? COLORS.cashInLight : COLORS.cashOutLight }]}>
                                <Ionicons
                                    name={isEmailVerified ? 'checkmark-circle' : 'alert-circle'}
                                    size={12}
                                    color={isEmailVerified ? COLORS.cashIn : COLORS.cashOut}
                                />
                                <Text style={[styles.verifiedText, { color: isEmailVerified ? COLORS.cashIn : COLORS.cashOut }]}>
                                    {' '}{isEmailVerified ? 'Email Verified' : 'Not Verified'}
                                </Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.editHint}>
                        <Ionicons name="create-outline" size={13} color={theme.textTertiary} />
                        <Text style={[styles.editHintText, { color: theme.textTertiary }]}> Tap to edit profile</Text>
                    </View>
                </TouchableOpacity>

                {/* ── App Settings ────────────────────────────── */}
                <SectionHeader title="App Settings" />
                <View style={[styles.card, { backgroundColor: theme.surface }]}>
                    <SettingRow
                        icon={isDark ? 'moon' : 'sunny'}
                        iconBg={isDark ? '#1E2235' : '#FFF9E6'}
                        iconColor={isDark ? '#A78BFA' : '#F59E0B'}
                        label={isDark ? 'Dark Mode' : 'Light Mode'}
                        sublabel="Toggle appearance theme"
                        right={
                            <Switch
                                value={isDark}
                                onValueChange={toggle}
                                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                                thumbColor="#fff"
                                ios_backgroundColor={COLORS.border}
                            />
                        }
                    />
                </View>

                {/* ── Members ─────────────────────────────────── */}
                <SectionHeader title="People You've Invited" />
                <View style={[styles.card, { backgroundColor: theme.surface }]}>
                    {loadingMembers ? (
                        <View style={styles.membersLoader}>
                            <ActivityIndicator color={COLORS.primary} size="small" />
                            <Text style={[styles.membersLoadingText, { color: theme.textSecondary }]}>Loading members...</Text>
                        </View>
                    ) : allMembers.length === 0 ? (
                        <View style={styles.emptyMembers}>
                            <Ionicons name="people-outline" size={32} color={theme.textTertiary} />
                            <Text style={[styles.emptyMembersText, { color: theme.textSecondary }]}>
                                You haven't invited anyone yet. Go to a book and tap 👥 to invite members.
                            </Text>
                        </View>
                    ) : (
                        allMembers.map((m, idx) => (
                            <View
                                key={m.user_id}
                                style={[
                                    styles.memberRow,
                                    idx < allMembers.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                                ]}
                            >
                                <LinearGradient
                                    colors={m.role === 'owner' ? ['#5B5FED', '#7C3AED'] : ['#9CA3AF', '#6B7280']}
                                    style={styles.memberAvatar}
                                >
                                    <Text style={styles.memberAvatarText}>
                                        {getInitials(m.profile?.full_name || m.profile?.email || '?')}
                                    </Text>
                                </LinearGradient>

                                <View style={styles.memberInfo}>
                                    <Text style={[styles.memberName, { color: theme.text }]} numberOfLines={1}>
                                        {getDisplayName(m.profile)}
                                    </Text>
                                    <Text style={[styles.memberEmail, { color: theme.textTertiary }]} numberOfLines={1}>
                                        {m.profile?.email}
                                    </Text>
                                </View>

                                <View style={[
                                    styles.roleBadge,
                                    { backgroundColor: m.role === 'owner' ? COLORS.primaryLight : theme.surfaceSecondary }
                                ]}>
                                    {m.role === 'owner' && <Ionicons name="star" size={10} color={COLORS.primary} />}
                                    <Text style={[
                                        styles.roleText,
                                        { color: m.role === 'owner' ? COLORS.primary : theme.textSecondary }
                                    ]}>
                                        {m.role === 'owner' ? ' Owner' : 'Member'}
                                    </Text>
                                </View>
                            </View>
                        ))
                    )}
                </View>

                {/* ── About CashFlow ───────────────────────────── */}
                <SectionHeader title="About CashFlow" />
                <View style={[styles.card, { backgroundColor: theme.surface }]}>
                    <SettingRow
                        icon="document-text-outline"
                        iconBg="#EEF2FF"
                        iconColor={COLORS.primary}
                        label="Privacy Policy"
                        onPress={() => navigation.navigate('PrivacyPolicy')}
                    />
                    <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
                    <SettingRow
                        icon="reader-outline"
                        iconBg="#EEF2FF"
                        iconColor={COLORS.primary}
                        label="Terms & Conditions"
                        onPress={() => navigation.navigate('Terms')}
                    />
                    <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
                    <SettingRow
                        icon="information-circle-outline"
                        iconBg="#EEF2FF"
                        iconColor={COLORS.primary}
                        label="About Us"
                        sublabel={`CashFlow v${APP_VERSION}`}
                        onPress={() =>
                            Alert.alert(
                                'CashFlow',
                                `Version ${APP_VERSION}\n\nA smart, collaborative expense tracker built for teams and individuals.\n\n© 2026 CashFlow. All rights reserved.`,
                                [{ text: 'OK' }]
                            )
                        }
                    />
                </View>
                <Text style={{ fontSize: FONT_SIZE.xs, color: theme.textTertiary, marginTop: SPACING.sm, marginLeft: 4 }}>
                    Made with ❤️ by Aakash sharma.
                </Text>

                {/* ── Sign Out ────────────────────────────────── */}
                <SectionHeader title="Account" />
                <View style={[styles.card, { backgroundColor: theme.surface }]}>
                    <SettingRow
                        icon="log-out-outline"
                        iconBg={COLORS.cashOutLight}
                        iconColor={COLORS.cashOut}
                        label="Sign Out"
                        danger
                        onPress={() => Alert.alert(
                            'Sign Out',
                            'Are you sure you want to sign out?',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Sign Out', style: 'destructive', onPress: signOut },
                            ]
                        )}
                    />
                </View>

                <View style={{ height: SPACING.xl }} />
            </ScrollView>
        </SafeAreaView>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    topBar: {
        paddingHorizontal: SPACING.lg,
        paddingTop: SPACING.md,
        paddingBottom: SPACING.lg,
    },
    pageTitle: {
        fontSize: FONT_SIZE['2xl'],
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    scroll: { paddingHorizontal: SPACING.lg, paddingBottom: 40 },

    sectionHeader: {
        fontSize: FONT_SIZE.xs,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: SPACING.sm,
        marginTop: SPACING.lg,
        marginLeft: 4,
    },
    card: {
        borderRadius: BORDER_RADIUS.lg,
        overflow: 'hidden',
        ...SHADOW.sm,
    },
    rowDivider: { height: 1, marginLeft: 56 },

    // Profile
    profileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
        gap: SPACING.md,
    },
    avatarWrap: { width: 64, height: 64, borderRadius: 20, overflow: 'hidden' },
    avatarImg: { width: 64, height: 64, borderRadius: 20 },
    avatarGrad: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { color: '#fff', fontSize: FONT_SIZE.xl, fontWeight: '800' },
    profileInfo: { flex: 1, gap: 4 },
    profileName: { fontSize: FONT_SIZE.lg, fontWeight: '700' },
    emailRow: { flexDirection: 'row', alignItems: 'center' },
    profileEmail: { fontSize: FONT_SIZE.sm, flex: 1 },
    verifiedBadge: {
        flexDirection: 'row', alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 20, marginTop: 2,
    },
    verifiedText: { fontSize: FONT_SIZE.xs, fontWeight: '700' },

    // Setting rows
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
        gap: SPACING.md,
    },
    rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    rowBody: { flex: 1 },
    rowLabel: { fontSize: FONT_SIZE.md, fontWeight: '600' },
    rowSub: { fontSize: FONT_SIZE.xs, marginTop: 1 },

    // Members
    membersLoader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.lg, justifyContent: 'center' },
    membersLoadingText: { fontSize: FONT_SIZE.sm },
    emptyMembers: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.sm },
    emptyMembersText: { fontSize: FONT_SIZE.sm, textAlign: 'center', lineHeight: 20 },
    memberRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, gap: SPACING.md,
    },
    memberAvatar: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    memberAvatarText: { color: '#fff', fontWeight: '800', fontSize: FONT_SIZE.sm },
    memberInfo: { flex: 1, gap: 2 },
    memberName: { fontSize: FONT_SIZE.md, fontWeight: '600' },
    memberEmail: { fontSize: FONT_SIZE.xs },
    roleBadge: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    },
    roleText: { fontSize: FONT_SIZE.xs, fontWeight: '700' },
    editHint: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm },
    editHintText: { fontSize: FONT_SIZE.xs },
})