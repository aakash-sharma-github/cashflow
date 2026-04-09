// src/screens/PrivacyPolicyScreen.tsx
import React from 'react'
import { ScrollView, Text, View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThemeStore, getTheme } from '../store/themeStore'
import { SPACING, FONT_SIZE, BORDER_RADIUS, COLORS } from '../constants'

const sections = [
    {
        title: '1. Information We Collect',
        body: `When you create an account, we collect your email address. When you use the app, we store the financial entries, book names, and notes you create. We also collect push notification tokens to deliver invitation alerts to your device.

We do not collect passwords, payment information, or sensitive financial data beyond what you explicitly enter.`,
    },
    {
        title: '2. How We Use Your Information',
        body: `Your information is used solely to provide the CashFlow service:

• To authenticate your account via email magic link
• To sync your books and entries across devices
• To send push notifications when you receive a book invitation
• To enable real-time collaboration with people you invite

We do not sell, rent, or share your personal data with third parties for marketing purposes.`,
    },
    {
        title: '3. Data Storage & Security',
        body: `Your data is stored securely on Supabase infrastructure (PostgreSQL), hosted on AWS. All data is encrypted in transit (TLS 1.2+) and at rest. Row Level Security (RLS) policies ensure that each user can only access their own data and books they are explicitly members of.`,
    },
    {
        title: '4. Data Retention',
        body: `Your data is retained as long as your account is active. If you delete your account, all associated data — including books, entries, and invitations — is permanently deleted within 30 days.`,
    },
    {
        title: '5. Third-Party Services',
        body: `CashFlow uses the following third-party services:

• Supabase — Database, authentication, and realtime (supabase.com)
• Expo — Mobile app infrastructure and push notifications (expo.dev)
• Resend — Transactional email for invitation notifications (resend.com)

Each of these services has its own privacy policy. We encourage you to review them.`,
    },
    {
        title: '6. Your Rights',
        body: `You have the right to:

• Access the personal data we hold about you
• Request correction of inaccurate data
• Request deletion of your account and data
• Export your data in CSV format (available in-app)

To exercise these rights, contact us at support@cashflow.app`,
    },
    {
        title: '7. Children\'s Privacy',
        body: `CashFlow is not intended for use by children under the age of 13. We do not knowingly collect personal information from children.`,
    },
    {
        title: '8. Changes to This Policy',
        body: `We may update this Privacy Policy from time to time. We will notify you of any significant changes via the app or by email. Continued use of the app after changes constitutes acceptance of the updated policy.`,
    },
    {
        title: '9. Contact',
        body: `If you have any questions about this Privacy Policy, please contact us at:\n\nsupport@cashflow.app`,
    },
]

export default function PrivacyPolicyScreen() {
    const { mode } = useThemeStore()
    const theme = getTheme(mode)

    return (
        <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={[s.header, { backgroundColor: COLORS.primaryLight }]}>
                    <Text style={s.headerEmoji}>🔒</Text>
                    <Text style={[s.headerTitle, { color: COLORS.primary }]}>Privacy Policy</Text>
                    <Text style={[s.headerSub, { color: COLORS.primary }]}>Last updated: January 2025</Text>
                </View>

                <Text style={[s.intro, { color: theme.textSecondary }]}>
                    CashFlow ("we", "our", or "us") is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information when you use our mobile application.
                </Text>

                {sections.map((sec, i) => (
                    <View key={i} style={[s.section, { borderTopColor: theme.border }]}>
                        <Text style={[s.sectionTitle, { color: theme.text }]}>{sec.title}</Text>
                        <Text style={[s.sectionBody, { color: theme.textSecondary }]}>{sec.body}</Text>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    )
}

const s = StyleSheet.create({
    container: { flex: 1 },
    scroll: { paddingBottom: 40 },
    header: { alignItems: 'center', padding: SPACING.xl, marginBottom: SPACING.lg },
    headerEmoji: { fontSize: 40, marginBottom: SPACING.sm },
    headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', marginBottom: 4 },
    headerSub: { fontSize: FONT_SIZE.sm, opacity: 0.75 },
    intro: { fontSize: FONT_SIZE.sm, lineHeight: 22, paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
    section: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderTopWidth: 1 },
    sectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: SPACING.sm },
    sectionBody: { fontSize: FONT_SIZE.sm, lineHeight: 22 },
})