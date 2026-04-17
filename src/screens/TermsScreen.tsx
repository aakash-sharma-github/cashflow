// src/screens/TermsScreen.tsx
import React from 'react'
import { ScrollView, Text, View, StyleSheet, TouchableOpacity, Linking, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore, getTheme } from '../store/themeStore'
import { SPACING, FONT_SIZE, COLORS } from '../constants'

const CONTACT_EMAIL = 'aakashsharma9855@gmail.com'
const LAST_UPDATED = 'April 2026'

const sections = [
    {
        title: '1. Acceptance of Terms',
        body: 'By downloading, installing, or using CashFlow ("the App"), you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the App.',
    },
    {
        title: '2. Account Registration',
        body: 'You must provide a valid email address to create an account. You are responsible for maintaining the confidentiality of your account and all activities that occur under it. You must be at least 13 years of age to use CashFlow.',
    },
    {
        title: '3. Permitted Use',
        body: 'CashFlow is intended for personal and business expense tracking. You agree not to:\n\n• Use the App to track or conceal illegal transactions\n• Attempt to reverse engineer or compromise the App\'s security\n• Share your account credentials with others\n• Use automated scripts or bots to interact with the App',
    },
    {
        title: '4. User Content',
        body: 'You retain ownership of all content you create within CashFlow. By using the App, you grant us a limited license to store and process this content solely to provide the service. You are responsible for the accuracy of any financial data you enter.',
    },
    {
        title: '5. Collaboration Features',
        body: 'When you invite another user to a book, they gain access to view and modify all entries within that book. You are responsible for managing who you invite. You can remove members at any time from the Members screen.',
    },
    {
        title: '6. Data and Backups',
        body: 'While we take reasonable measures to protect your data, we recommend periodically exporting your data using the CSV or PDF export feature. CashFlow is not a financial institution and does not provide accounting, tax, or legal advice.',
    },
    {
        title: '7. Service Availability',
        body: 'We strive to maintain high availability but do not guarantee uninterrupted access. We may perform maintenance or updates that temporarily affect availability and will endeavour to notify users of planned downtime.',
    },
    {
        title: '8. Intellectual Property',
        body: 'The CashFlow application, including its design, code, and branding, is owned by CashFlow and protected by applicable intellectual property laws. You may not copy, modify, or distribute any part of the App without prior written consent.',
    },
    {
        title: '9. Limitation of Liability',
        body: 'To the maximum extent permitted by applicable law, CashFlow shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App, including financial loss resulting from inaccurate data entry.',
    },
    {
        title: '10. Termination',
        body: 'We reserve the right to suspend or terminate your account if you violate these Terms. You may delete your account at any time from the Settings screen. Upon termination, your data will be deleted per our Privacy Policy.',
    },
    {
        title: '11. Changes to Terms',
        body: 'We may update these Terms from time to time. We will notify you of material changes via the App or by email. Your continued use after such notice constitutes acceptance of the updated Terms.',
    },
    {
        title: '12. Contact Us',
        body: 'For questions about these Terms or to provide feedback, please reach out to us at ' + CONTACT_EMAIL,
    },
]

export default function TermsScreen() {
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
                    <Text style={[s.pageTitle, { color: COLORS.primary }]}>Terms &amp; Conditions</Text>
                    <Text style={[s.lastUpdated, { color: COLORS.primary }]}>Last updated: {LAST_UPDATED}</Text>
                </View>

                <Text style={[s.intro, { color: theme.textSecondary }]}>
                    Please read these Terms and Conditions carefully before using CashFlow.
                </Text>

                {sections.map((sec, i) => (
                    <View key={i} style={[s.section, { borderTopColor: theme.border }]}>
                        <Text style={[s.sectionTitle, { color: theme.text }]}>{sec.title}</Text>
                        <Text style={[s.sectionBody, { color: theme.textSecondary }]}>{sec.body}</Text>
                    </View>
                ))}

                {/* Contact / feedback */}
                <View style={[s.contactCard, { backgroundColor: theme.surface }]}>
                    <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                        <Text style={[s.contactLabel, { color: theme.textSecondary }]}>Feedback &amp; questions</Text>
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

    intro: { fontSize: FONT_SIZE.sm, lineHeight: 22, paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg },
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