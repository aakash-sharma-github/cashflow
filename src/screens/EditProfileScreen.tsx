// src/screens/EditProfileScreen.tsx
import React, { useState } from 'react'
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../store/authStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { authService } from '../services/authService'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { getInitials } from '../utils'

export default function EditProfileScreen({ navigation }: any) {
    const { user, refreshProfile } = useAuthStore()
    const { mode } = useThemeStore()
    const theme = getTheme(mode)

    const [fullName, setFullName] = useState(user?.full_name || '')
    const [focused, setFocused] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleSave = async () => {
        const trimmed = fullName.trim()
        if (!trimmed) {
            Alert.alert('Required', 'Please enter your name.')
            return
        }
        if (trimmed === user?.full_name) {
            navigation.goBack()
            return
        }
        setLoading(true)
        const { error } = await authService.updateProfile({ full_name: trimmed })
        setLoading(false)
        if (error) {
            Alert.alert('Update Failed', error)
            return
        }
        await refreshProfile()
        navigation.goBack()
    }

    return (
        <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

                    {/* Avatar */}
                    <View style={s.avatarSection}>
                        <LinearGradient colors={['#5B5FED', '#7C3AED']} style={s.avatar}>
                            <Text style={s.avatarInitial}>
                                {getInitials(fullName || user?.email || '?')}
                            </Text>
                        </LinearGradient>
                        <Text style={[s.avatarHint, { color: theme.textTertiary }]}>
                            Avatar is generated from your initials
                        </Text>
                    </View>

                    {/* Name field */}
                    <View style={s.field}>
                        <Text style={[s.label, { color: theme.textSecondary }]}>Display Name</Text>
                        <View style={[
                            s.inputWrap,
                            { backgroundColor: theme.surface, borderColor: theme.border },
                            focused && {
                                borderColor: COLORS.primary,
                                backgroundColor: mode === 'dark'
                                    ? theme.surfaceSecondary   // darker surface for dark mode
                                    : COLORS.primaryLight      // keep light for light mode
                            },
                        ]}>
                            <Ionicons
                                name="person-outline"
                                size={18}
                                color={focused ? COLORS.primary : theme.textTertiary}
                                style={{ marginRight: 10 }}
                            />
                            <TextInput
                                style={[s.input, { color: theme.text }]}
                                value={fullName}
                                onChangeText={setFullName}
                                placeholder="Your full name"
                                placeholderTextColor={theme.textTertiary}
                                autoFocus
                                maxLength={60}
                                onFocus={() => setFocused(true)}
                                onBlur={() => setFocused(false)}
                                returnKeyType="done"
                                onSubmitEditing={handleSave}
                            />
                            {fullName.length > 0 && (
                                <TouchableOpacity onPress={() => setFullName('')}>
                                    <Ionicons name="close-circle" size={18} color={theme.textTertiary} />
                                </TouchableOpacity>
                            )}
                        </View>
                        <Text style={[s.hint, { color: theme.textTertiary }]}>
                            This is the name shown to other collaborators.
                        </Text>
                    </View>

                    {/* Email (read-only) */}
                    <View style={s.field}>
                        <Text style={[s.label, { color: theme.textSecondary }]}>Email Address</Text>
                        <View style={[s.emailRow, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
                            <Ionicons name="mail-outline" size={18} color={theme.textTertiary} style={{ marginRight: 10 }} />
                            <Text style={[s.emailText, { color: theme.textSecondary }]}>{user?.email}</Text>
                            <View style={s.verifiedBadge}>
                                <Ionicons name="checkmark-circle" size={14} color={COLORS.cashIn} />
                                <Text style={s.verifiedText}> Verified</Text>
                            </View>
                        </View>
                        <Text style={[s.hint, { color: theme.textTertiary }]}>Email cannot be changed.</Text>
                    </View>

                    {/* Save button */}
                    <TouchableOpacity
                        style={[s.saveBtn, { opacity: loading ? 0.7 : 1 }]}
                        onPress={handleSave}
                        disabled={loading}
                        activeOpacity={0.88}
                    >
                        <LinearGradient
                            colors={['#5B5FED', '#7C3AED']}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={s.saveBtnGrad}
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : (
                                <>
                                    <Ionicons name="checkmark" size={20} color="#fff" />
                                    <Text style={s.saveBtnText}>Save Changes</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    )
}

const s = StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: SPACING.lg, paddingBottom: SPACING.xl },

    avatarSection: { alignItems: 'center', marginBottom: SPACING.xl },
    avatar: { width: 88, height: 88, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm, ...SHADOW.md },
    avatarInitial: { color: '#fff', fontSize: FONT_SIZE['2xl'], fontWeight: '900' },
    avatarHint: { fontSize: FONT_SIZE.xs, marginTop: 4 },

    field: { marginBottom: SPACING.lg },
    label: { fontSize: FONT_SIZE.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: SPACING.sm },
    inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, paddingHorizontal: SPACING.md, height: 52 },
    input: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '500' },
    hint: { fontSize: FONT_SIZE.xs, marginTop: SPACING.sm, lineHeight: 18 },

    emailRow: { flexDirection: 'row', alignItems: 'center', borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, paddingHorizontal: SPACING.md, height: 52 },
    emailText: { flex: 1, fontSize: FONT_SIZE.md },
    verifiedBadge: { flexDirection: 'row', alignItems: 'center' },
    verifiedText: { fontSize: FONT_SIZE.xs, color: COLORS.cashIn, fontWeight: '700' },

    saveBtn: { borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', marginTop: SPACING.md, ...SHADOW.md },
    saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: SPACING.sm },
    saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },
})