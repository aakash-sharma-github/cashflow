// src/screens/TermsScreen.tsx
import React from 'react'
import { ScrollView, Text, View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useThemeStore, getTheme } from '../store/themeStore'
import { SPACING, FONT_SIZE, COLORS } from '../constants'

const sections = [
    {
        title: '1. Acceptance of Terms',
        body: `By downloading, installing, or using CashFlow ("the App"), you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the App.`,
    },
    {
        title: '2. Account Registration',
        body: `You must provide a valid email address to create an account. You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.

You must be at least 13 years of age to use CashFlow.`,
    },
    {
        title: '3. Permitted Use',
        body: `CashFlow is intended for personal and business expense tracking. You agree to use the App only for lawful purposes and in a manner that does not infringe the rights of others.

You agree not to:
• Use the App to track or conceal illegal transactions
• Attempt to reverse engineer or compromise the App's security
• Share your account credentials with others
• Use automated scripts or bots to interact with the App`,
    },
    {
        title: '4. User Content',
        body: `You retain ownership of all content you create within CashFlow (books, entries, notes). By using the App, you grant us a limited license to store and process this content solely for the purpose of providing the service.

You are responsible for the accuracy of any financial data you enter. CashFlow does not verify or validate the financial accuracy of your entries.`,
    },
    {
        title: '5. Collaboration Features',
        body: `When you invite another user to a book, they gain access to view and modify all entries within that book. You are responsible for managing who you invite and for the actions of users you have granted access to.

You can remove members from your books at any time from the Members screen.`,
    },
    {
        title: '6. Data and Backups',
        body: `While we take reasonable measures to protect your data, we do not guarantee that your data will never be lost or corrupted. We recommend periodically exporting your data using the CSV export feature.

CashFlow is not a financial institution and does not provide accounting, tax, or legal advice.`,
    },
    {
        title: '7. Service Availability',
        body: `We strive to maintain high availability but do not guarantee uninterrupted access to the App. We may perform maintenance, updates, or changes to the service that temporarily affect availability. We will endeavor to notify users of planned downtime.`,
    },
    {
        title: '8. Intellectual Property',
        body: `The CashFlow application, including its design, code, and branding, is owned by CashFlow and protected by applicable intellectual property laws. You may not copy, modify, or distribute any part of the App without our prior written consent.`,
    },
    {
        title: '9. Limitation of Liability',
        body: `To the maximum extent permitted by applicable law, CashFlow shall not be liable for any indirect, incidental, special, or consequential damages arising out of or in connection with your use of the App, including but not limited to financial loss resulting from inaccurate data entry.`,
    },
    {
        title: '10. Termination',
        body: `We reserve the right to suspend or terminate your account if you violate these Terms. You may delete your account at any time from the Settings screen. Upon termination, your data will be deleted in accordance with our Privacy Policy.`,
    },
    {
        title: '11. Changes to Terms',
        body: `We may update these Terms from time to time. We will notify you of material changes via the App or by email. Your continued use after such notice constitutes acceptance of the updated Terms.`,
    },
    {
        title: '12. Governing Law',
        body: `These Terms shall be governed by and construed in accordance with applicable laws. Any disputes arising from these Terms shall be resolved through good-faith negotiation before resorting to formal dispute resolution.`,
    },
    {
        title: '13. Contact Us',
        body: `For questions about these Terms, please contact us at:\n\nsupport@cashflow.app`,
    },
]

export default function TermsScreen() {
    const { mode } = useThemeStore()
    const theme = getTheme(mode)

    return (
        <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={[s.header, { backgroundColor: COLORS.primaryLight }]}>
                    <Text style={s.headerEmoji}>📜</Text>
                    <Text style={[s.headerTitle, { color: COLORS.primary }]}>Terms & Conditions</Text>
                    <Text style={[s.headerSub, { color: COLORS.primary }]}>Last updated: January 2025</Text>
                </View>

                <Text style={[s.intro, { color: theme.textSecondary }]}>
                    Please read these Terms and Conditions carefully before using the CashFlow mobile application operated by CashFlow.
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