// src/components/common/ThemedAlert.tsx
// Custom themed alert/confirm dialog that matches app design.
// Replaces raw Alert.alert() across the app for delete confirms and warnings.
import React, { useState, useCallback } from 'react'
import {
    View, Text, TouchableOpacity, StyleSheet, Modal, Pressable,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore, getTheme } from '../../store/themeStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../../constants'

export interface AlertButton {
    text: string
    style?: 'default' | 'cancel' | 'destructive'
    onPress?: () => void
}

interface AlertState {
    visible: boolean
    title: string
    message: string
    icon?: string
    iconColor?: string
    buttons: AlertButton[]
}

// Singleton state — we export a function to show the alert from anywhere
let showAlertFn: ((config: Omit<AlertState, 'visible'>) => void) | null = null

export function themedAlert(
    title: string,
    message: string,
    buttons: AlertButton[] = [{ text: 'OK' }],
    icon?: string,
    iconColor?: string,
) {
    if (showAlertFn) {
        showAlertFn({ title, message, buttons, icon, iconColor })
    }
}

// Mount this once at the root (App.tsx already has it via RootNavigator)
export function ThemedAlertProvider() {
    const [state, setState] = useState<AlertState>({
        visible: false, title: '', message: '', buttons: [],
    })
    const { mode } = useThemeStore()
    const theme = getTheme(mode)

    // Register the function
    showAlertFn = useCallback((config) => {
        setState({ visible: true, ...config })
    }, [])

    const dismiss = () => setState(s => ({ ...s, visible: false }))

    const handleButton = (btn: AlertButton) => {
        dismiss()
        btn.onPress?.()
    }

    if (!state.visible) return null

    const iconColor = state.iconColor || (
        state.buttons.some(b => b.style === 'destructive') ? COLORS.cashOut : COLORS.primary
    )
    const iconBg = state.buttons.some(b => b.style === 'destructive')
        ? COLORS.cashOutLight : COLORS.primaryLight
    const iconName = (state.icon ||
        (state.buttons.some(b => b.style === 'destructive') ? 'trash-outline' : 'information-circle-outline')
    ) as any

    return (
        <Modal transparent animationType="fade" visible={state.visible} onRequestClose={dismiss}>
            <Pressable style={s.backdrop} onPress={dismiss} />
            <View style={s.center} pointerEvents="box-none">
                <View style={[s.dialog, { backgroundColor: theme.surface }]}>
                    {/* Icon */}
                    <View style={[s.iconWrap, { backgroundColor: iconBg }]}>
                        <Ionicons name={iconName} size={28} color={iconColor} />
                    </View>

                    {/* Text */}
                    <Text style={[s.title, { color: theme.text }]}>{state.title}</Text>
                    {state.message ? (
                        <Text style={[s.message, { color: theme.textSecondary }]}>{state.message}</Text>
                    ) : null}

                    {/* Buttons */}
                    <View style={[s.btnRow, state.buttons.length > 2 && s.btnCol]}>
                        {state.buttons.map((btn, i) => {
                            const isDestructive = btn.style === 'destructive'
                            const isCancel = btn.style === 'cancel'
                            const isLast = i === state.buttons.length - 1
                            const isPrimary = !isCancel && isLast

                            if (isCancel) {
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={[s.cancelBtn, { borderColor: theme.border }]}
                                        onPress={() => handleButton(btn)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[s.cancelText, { color: theme.textSecondary }]}>{btn.text}</Text>
                                    </TouchableOpacity>
                                )
                            }

                            if (isDestructive) {
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={s.destructiveBtn}
                                        onPress={() => handleButton(btn)}
                                        activeOpacity={0.88}
                                    >
                                        <LinearGradient
                                            colors={['#FF647C', '#E84560']}
                                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                            style={s.btnGrad}
                                        >
                                            <Ionicons name="trash-outline" size={15} color="#fff" />
                                            <Text style={s.destructiveText}>{btn.text}</Text>
                                        </LinearGradient>
                                    </TouchableOpacity>
                                )
                            }

                            return (
                                <TouchableOpacity
                                    key={i}
                                    style={[s.primaryBtn, { opacity: 1 }]}
                                    onPress={() => handleButton(btn)}
                                    activeOpacity={0.88}
                                >
                                    <LinearGradient
                                        colors={['#5B5FED', '#7C3AED']}
                                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                        style={s.btnGrad}
                                    >
                                        <Text style={s.primaryText}>{btn.text}</Text>
                                    </LinearGradient>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>
            </View>
        </Modal>
    )
}

const s = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    center: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.xl,
    },
    dialog: {
        width: '100%',
        maxWidth: 360,
        borderRadius: BORDER_RADIUS.xl,
        padding: SPACING.xl,
        alignItems: 'center',
        ...SHADOW.lg,
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.md,
    },
    title: {
        fontSize: FONT_SIZE.lg,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: SPACING.sm,
        letterSpacing: -0.3,
    },
    message: {
        fontSize: FONT_SIZE.sm,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: SPACING.lg,
    },
    btnRow: {
        flexDirection: 'row',
        gap: SPACING.sm,
        width: '100%',
    },
    btnCol: {
        flexDirection: 'column',
    },
    cancelBtn: {
        flex: 1,
        paddingVertical: 13,
        borderRadius: BORDER_RADIUS.md,
        alignItems: 'center',
        borderWidth: 1.5,
    },
    cancelText: {
        fontSize: FONT_SIZE.md,
        fontWeight: '600',
    },
    destructiveBtn: {
        flex: 1,
        borderRadius: BORDER_RADIUS.md,
        overflow: 'hidden',
    },
    primaryBtn: {
        flex: 1,
        borderRadius: BORDER_RADIUS.md,
        overflow: 'hidden',
    },
    btnGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
        gap: 6,
    },
    destructiveText: {
        fontSize: FONT_SIZE.md,
        fontWeight: '700',
        color: '#fff',
    },
    primaryText: {
        fontSize: FONT_SIZE.md,
        fontWeight: '700',
        color: '#fff',
    },
})