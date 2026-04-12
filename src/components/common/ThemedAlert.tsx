// src/components/common/ThemedAlert.tsx
// Modern themed alert dialog — replaces all Alert.alert() calls.
//
// Architecture:
//   - ThemedAlertProvider mounts at the ROOT level (App.tsx), outside navigation
//   - themedAlert() is a synchronous function usable from any screen
//   - showActionSheet() shows a bottom sheet for multi-option menus (replaces Alert with 3+ options)
//   - Uses a Zustand-like ref-based singleton so it never loses the function reference
import React, { useState, useEffect, useRef } from 'react'
import {
    View, Text, TouchableOpacity, StyleSheet, Modal,
    Pressable, Animated, Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useThemeStore, getTheme } from '../../store/themeStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../../constants'

const { height: SCREEN_HEIGHT } = Dimensions.get('window')

// ── Types ─────────────────────────────────────────────────────────
export interface AlertButton {
    text: string
    style?: 'default' | 'cancel' | 'destructive'
    onPress?: () => void
}

interface DialogConfig {
    type: 'alert'
    title: string
    message?: string
    icon?: string
    buttons: AlertButton[]
}

interface SheetConfig {
    type: 'sheet'
    title: string
    message?: string
    options: AlertButton[]
}

type Config = DialogConfig | SheetConfig

// ── Singleton ─────────────────────────────────────────────────────
// Using a ref stored outside React to guarantee stable reference across renders
const _listeners: Array<(config: Config | null) => void> = []

function _emit(config: Config | null) {
    _listeners.forEach(fn => fn(config))
}

/** Show a themed confirm/info dialog. Drop-in replacement for Alert.alert() */
export function themedAlert(
    title: string,
    message?: string,
    buttons: AlertButton[] = [{ text: 'OK' }],
    icon?: string,
) {
    _emit({ type: 'alert', title, message: message || '', icon, buttons })
}

/** Show a bottom action sheet for multi-option choices (replaces Alert.alert with 3+ options) */
export function themedActionSheet(
    title: string,
    message: string | undefined,
    options: AlertButton[],
) {
    _emit({ type: 'sheet', title, message, options })
}

// ── Provider — mount once in App.tsx ──────────────────────────────
export function ThemedAlertProvider() {
    const [config, setConfig] = useState<Config | null>(null)
    const { mode } = useThemeStore()
    const theme = getTheme(mode)
    const scaleAnim = useRef(new Animated.Value(0.88)).current
    const sheetAnim = useRef(new Animated.Value(300)).current

    useEffect(() => {
        const handler = (cfg: Config | null) => setConfig(cfg)
        _listeners.push(handler)
        return () => {
            const idx = _listeners.indexOf(handler)
            if (idx > -1) _listeners.splice(idx, 1)
        }
    }, [])

    useEffect(() => {
        if (!config) return
        if (config.type === 'alert') {
            scaleAnim.setValue(0.88)
            Animated.spring(scaleAnim, {
                toValue: 1, useNativeDriver: true,
                tension: 280, friction: 16,
            }).start()
        } else {
            sheetAnim.setValue(SCREEN_HEIGHT)
            Animated.spring(sheetAnim, {
                toValue: 0, useNativeDriver: true,
                tension: 260, friction: 22,
            }).start()
        }
    }, [config])

    const dismiss = () => setConfig(null)

    const handleBtn = (btn: AlertButton) => {
        dismiss()
        // Small delay so dismiss animation completes before action runs
        setTimeout(() => btn.onPress?.(), 80)
    }

    if (!config) return null

    // ── Confirm dialog ───────────────────────────────────────────────
    if (config.type === 'alert') {
        const isDestructiveAlert = config.buttons.some(b => b.style === 'destructive')
        const iconName = (config.icon || (isDestructiveAlert ? 'trash-outline' : 'information-circle-outline')) as any
        const iconColor = isDestructiveAlert ? COLORS.cashOut : COLORS.primary
        const iconBg = isDestructiveAlert ? COLORS.cashOutLight : COLORS.primaryLight

        return (
            <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={dismiss}>
                <Pressable style={s.overlay} onPress={dismiss}>
                    <Animated.View
                        style={[s.dialog, { backgroundColor: theme.surface, transform: [{ scale: scaleAnim }] }]}
                        // Prevent tap from propagating to Pressable backdrop
                        onStartShouldSetResponder={() => true}
                    >
                        {/* Icon circle */}
                        <View style={[s.iconCircle, { backgroundColor: iconBg }]}>
                            <Ionicons name={iconName} size={30} color={iconColor} />
                        </View>

                        {/* Title */}
                        <Text style={[s.dialogTitle, { color: theme.text }]}>{config.title}</Text>

                        {/* Message */}
                        {!!config.message && (
                            <Text style={[s.dialogMsg, { color: theme.textSecondary }]}>{config.message}</Text>
                        )}

                        {/* Divider */}
                        <View style={[s.divider, { backgroundColor: theme.border }]} />

                        {/* Buttons */}
                        <View style={[s.btnRow, config.buttons.length > 2 && { flexDirection: 'column' }]}>
                            {config.buttons.map((btn, i) => {
                                const isCancelBtn = btn.style === 'cancel'
                                const isDestBtn = btn.style === 'destructive'
                                const isLastBtn = i === config.buttons.length - 1
                                const showDivider = i < config.buttons.length - 1 && config.buttons.length <= 2

                                return (
                                    <React.Fragment key={i}>
                                        {showDivider && config.buttons.length === 2 && (
                                            <View style={[s.btnDivider, { backgroundColor: theme.border }]} />
                                        )}
                                        <TouchableOpacity
                                            style={[
                                                s.dialogBtn,
                                                isCancelBtn && s.cancelDialogBtn,
                                                isDestBtn && s.destructDialogBtn,
                                                !isCancelBtn && !isDestBtn && s.primaryDialogBtn,
                                                config.buttons.length > 2 && { flex: 0, width: '100%', marginBottom: SPACING.sm },
                                            ]}
                                            onPress={() => handleBtn(btn)}
                                            activeOpacity={0.82}
                                        >
                                            {isDestBtn && <Ionicons name="trash-outline" size={15} color="#fff" style={{ marginRight: 4 }} />}
                                            <Text style={[
                                                s.dialogBtnText,
                                                isCancelBtn && { color: theme.textSecondary },
                                                isDestBtn && { color: '#fff' },
                                                !isCancelBtn && !isDestBtn && { color: COLORS.primary },
                                            ]}>
                                                {btn.text}
                                            </Text>
                                        </TouchableOpacity>
                                    </React.Fragment>
                                )
                            })}
                        </View>
                    </Animated.View>
                </Pressable>
            </Modal>
        )
    }

    // ── Action sheet ─────────────────────────────────────────────────
    if (config.type === 'sheet') {
        return (
            <Modal transparent animationType="none" visible statusBarTranslucent onRequestClose={dismiss}>
                <View style={s.sheetOverlay}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
                    <Animated.View
                        style={[
                            s.sheet,
                            { backgroundColor: theme.surface, transform: [{ translateY: sheetAnim }] },
                        ]}
                    >
                        {/* Handle */}
                        <View style={[s.sheetHandle, { backgroundColor: theme.border }]} />

                        {/* Header */}
                        {(config.title || config.message) && (
                            <View style={[s.sheetHeader, { borderBottomColor: theme.border }]}>
                                {config.title && <Text style={[s.sheetTitle, { color: theme.text }]}>{config.title}</Text>}
                                {config.message && <Text style={[s.sheetMsg, { color: theme.textSecondary }]}>{config.message}</Text>}
                            </View>
                        )}

                        {/* Options */}
                        {config.options.map((opt, i) => {
                            const isCancel = opt.style === 'cancel'
                            const isDestruct = opt.style === 'destructive'
                            if (isCancel) return null // render cancel at bottom

                            return (
                                <TouchableOpacity
                                    key={i}
                                    style={[s.sheetOption, { borderBottomColor: theme.border }]}
                                    onPress={() => handleBtn(opt)}
                                    activeOpacity={0.75}
                                >
                                    <Text style={[
                                        s.sheetOptionText,
                                        { color: isDestruct ? COLORS.cashOut : theme.text },
                                        isDestruct && { fontWeight: '700' },
                                    ]}>
                                        {opt.text}
                                    </Text>
                                    {isDestruct && <Ionicons name="trash-outline" size={17} color={COLORS.cashOut} />}
                                </TouchableOpacity>
                            )
                        })}

                        {/* Cancel button */}
                        {config.options.some(o => o.style === 'cancel') && (
                            <TouchableOpacity
                                style={[s.sheetCancel, { backgroundColor: theme.surfaceSecondary }]}
                                onPress={() => handleBtn(config.options.find(o => o.style === 'cancel')!)}
                                activeOpacity={0.8}
                            >
                                <Text style={[s.sheetCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                            </TouchableOpacity>
                        )}
                    </Animated.View>
                </View>
            </Modal>
        )
    }

    return null
}

// ── Styles ────────────────────────────────────────────────────────
const s = StyleSheet.create({
    // Dialog
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.xl,
    },
    dialog: {
        width: '100%',
        maxWidth: 340,
        borderRadius: BORDER_RADIUS.xl,
        paddingTop: SPACING.xl,
        paddingHorizontal: SPACING.xl,
        paddingBottom: SPACING.md,
        alignItems: 'center',
        ...SHADOW.lg,
    },
    iconCircle: {
        width: 68, height: 68, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: SPACING.md,
    },
    dialogTitle: {
        fontSize: FONT_SIZE.lg, fontWeight: '800',
        textAlign: 'center', marginBottom: SPACING.sm, letterSpacing: -0.3,
    },
    dialogMsg: {
        fontSize: FONT_SIZE.sm, textAlign: 'center',
        lineHeight: 20, marginBottom: SPACING.md,
    },
    divider: { height: 1, width: '100%', marginBottom: SPACING.md },
    btnRow: {
        flexDirection: 'row', gap: SPACING.sm, width: '100%', paddingBottom: SPACING.sm,
    },
    btnDivider: { width: 1, alignSelf: 'stretch' },

    dialogBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 13, borderRadius: BORDER_RADIUS.md,
    },
    cancelDialogBtn: { borderWidth: 1.5, borderColor: '#E5E7EB' },
    destructDialogBtn: { backgroundColor: COLORS.cashOut },
    primaryDialogBtn: { borderWidth: 1.5, borderColor: COLORS.primary },
    dialogBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700' },

    // Sheet
    sheetOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    sheet: {
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingBottom: 34, overflow: 'hidden',
        ...SHADOW.lg,
    },
    sheetHandle: {
        width: 44, height: 4, borderRadius: 2,
        alignSelf: 'center', marginTop: 12, marginBottom: SPACING.sm,
    },
    sheetHeader: {
        paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md,
        borderBottomWidth: 1, marginBottom: SPACING.sm,
    },
    sheetTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: 2 },
    sheetMsg: { fontSize: FONT_SIZE.sm, lineHeight: 18 },
    sheetOption: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg, paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    sheetOptionText: { fontSize: FONT_SIZE.lg },
    sheetCancel: {
        margin: SPACING.md, borderRadius: BORDER_RADIUS.lg,
        paddingVertical: 15, alignItems: 'center',
    },
    sheetCancelText: { fontSize: FONT_SIZE.md, fontWeight: '700' },
})