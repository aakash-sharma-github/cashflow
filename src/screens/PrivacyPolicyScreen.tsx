// src/screens/PrivacyPolicyScreen.tsx
import React from 'react'
import { ScrollView, Text, View, StyleSheet, TouchableOpacity, Linking, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore, getTheme } from '../store/themeStore'
import { SPACING, FONT_SIZE, COLORS } from '../constants'

const CONTACT_EMAIL = 'aakashsharma9855@gmail.com'
const LAST_UPDATED = 'April 2025'

const sections = [
    {
        title: '1. Information We Collect',
        body: 'When you create an account, we collect your email address and display name. When you use the app, we store the financial entries, book names, and notes you create. We also collect device push notification tokens to deliver invitation alerts.\n\nWe do not collect passwords, payment information, or sensitive financial data beyond what you explicitly enter.',
    },
    {
        title: '2. How We Use Your Information',
        body: 'Your information is used solely to provide the CashFlow service:\n\n• Authenticate your account via email magic link or Google OAuth\n• Sync your books and entries across devices\n• Send push notifications when you receive a book invitation\n• Enable real-time collaboration with people you invite\n\nWe do not sell, rent, or share your personal data with third parties for marketing purposes.',
    },
    {
        title: '3. Data Storage & Security',
        body: 'Your data is stored securely on Supabase infrastructure (PostgreSQL), hosted on AWS. All data is encrypted in transit (TLS 1.2+) and at rest. Row Level Security (RLS) policies ensure each user can only access their own data and books they are explicitly members of.',
    },
    {
        title: '4. Data Retention',
        body: 'Your data is retained as long as your account is active. If you request account deletion, all associated data — books, entries, and invitations — is permanently deleted within 30 days.',
    },
    {
        title: '5. Third-Party Services',
        body: 'CashFlow uses the following third-party services:\n\n• Supabase — Database, authentication, and realtime\n• Expo — Mobile app infrastructure and push notifications\n• Resend — Transactional email for invitation notifications\n\nEach service has its own privacy policy. We encourage you to review them.',
    },
    {
        title: '6. Your Rights',
        body: 'You have the right to:\n\n• Access the personal data we hold about you\n• Request correction of inaccurate data\n• Request deletion of your account and data\n• Export your data in CSV or PDF format (available in-app)\n\nTo exercise these rights, contact us at ' + CONTACT_EMAIL,
    },
    {
        title: "7. Children's Privacy",
        body: 'CashFlow is not intended for use by children under the age of 13. We do not knowingly collect personal information from children.',
    },
    {
        title: '8. Changes to This Policy',
        body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes via the app or by email. Continued use of the app after changes constitutes acceptance of the updated policy.',
    },
]

export default function PrivacyPolicyScreen() {
    const { mode } = useThemeStore()
    const theme = getTheme(mode)

    return (
        <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

                {/* Logo header */}
                <View style={[s.logoHeader, { backgroundColor: COLORS.primaryLight }]}>
                    <Image
                        source={require('../../assets/icon.png')}
                        style={{ width: 45, height: 45 }}
                    />
                    <Text style={[s.logoAppName, { color: COLORS.primary }]}>CashFlow</Text>
                    <Text style={[s.pageTitle, { color: COLORS.primary }]}>Privacy Policy</Text>
                    <Text style={[s.lastUpdated, { color: COLORS.primary }]}>Last updated: {LAST_UPDATED}</Text>
                </View>

                <Text style={[s.intro, { color: theme.textSecondary }]}>
                    CashFlow is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information.
                </Text>

                {sections.map((sec, i) => (
                    <View key={i} style={[s.section, { borderTopColor: theme.border }]}>
                        <Text style={[s.sectionTitle, { color: theme.text }]}>{sec.title}</Text>
                        <Text style={[s.sectionBody, { color: theme.textSecondary }]}>{sec.body}</Text>
                    </View>
                ))}

                {/* Contact */}
                <View style={[s.contactCard, { backgroundColor: theme.surface }]}>
                    <Ionicons name="mail-outline" size={20} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                        <Text style={[s.contactLabel, { color: theme.textSecondary }]}>Questions or concerns?</Text>
                        <TouchableOpacity onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>
                            <Text style={[s.contactEmail, { color: COLORS.primary }]}>{CONTACT_EMAIL}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

            </ScrollView>
        </SafeAreaView>
    )
}

const s = StyleSheet.create({
    container: { flex: 1 },
    scroll: { paddingBottom: 40 },

    logoHeader: {
        alignItems: 'center', padding: SPACING.xl,
        marginBottom: SPACING.lg, marginHorizontal: SPACING.lg,
        marginTop: SPACING.lg, borderRadius: 18,
    },
    logoCircle: { width: 64, height: 64, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
    logoEmoji: { fontSize: 32 },
    logoAppName: { fontSize: FONT_SIZE.sm, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
    pageTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', marginBottom: 4 },
    lastUpdated: { fontSize: FONT_SIZE.xs, opacity: 0.7 },

    intro: { fontSize: FONT_SIZE.sm, lineHeight: 22, paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg, color: '#6B7280' },
    section: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
    sectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.sm },
    sectionBody: { fontSize: FONT_SIZE.sm, lineHeight: 22 },

    contactCard: {
        flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
        marginHorizontal: SPACING.lg, marginTop: SPACING.lg,
        padding: SPACING.md, borderRadius: 18,
    },
    contactLabel: { fontSize: FONT_SIZE.xs, marginBottom: 2 },
    contactEmail: { fontSize: FONT_SIZE.sm, fontWeight: '700' },
})