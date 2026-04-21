// src/screens/VerifyOtpScreen.tsx
import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../store/authStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { themedAlert } from '../components/common/ThemedAlert'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'

const OTP_LENGTH = 6

export default function VerifyOtpScreen({ route, navigation }: any) {
  const { email } = route.params
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [resendTimer, setResendTimer] = useState(60)
  const inputs = useRef<TextInput[]>([])
  const verifyOtp = useAuthStore(s => s.verifyOtp)
  const sendOtp = useAuthStore(s => s.sendOtp)
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  useEffect(() => {
    if (resendTimer <= 0) return
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [resendTimer])

  const handleChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return
    const next = [...otp]
    next[index] = value.slice(-1)
    setOtp(next)
    if (value && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus()
    if (next.every(v => v) && next.join('').length === OTP_LENGTH) handleVerify(next.join(''))
  }

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) inputs.current[index - 1]?.focus()
  }

  const handleVerify = async (code?: string) => {
    const token = code || otp.join('')
    if (token.length < OTP_LENGTH) { themedAlert('Incomplete', 'Enter the 6-digit code.'); return }
    setLoading(true)
    const { error } = await verifyOtp(email, token)
    setLoading(false)
    if (error) {
      themedAlert('Invalid Code', 'Code is incorrect or expired.')
      setOtp(Array(OTP_LENGTH).fill(''))
      inputs.current[0]?.focus()
    }
  }

  const handleResend = async () => {
    setResendTimer(60)
    setOtp(Array(OTP_LENGTH).fill(''))
    inputs.current[0]?.focus()
    const { error } = await sendOtp(email)
    if (error) themedAlert('Error', 'Could not resend code.')
  }

  const filled = otp.filter(v => v !== '').length

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity
          style={[s.backBtn, { backgroundColor: theme.surface }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </TouchableOpacity>

        <View style={s.content}>
          <LinearGradient colors={['#5B5FED', '#7C3AED']} style={s.iconGrad}>
            <Ionicons name="mail" size={32} color="#fff" />
          </LinearGradient>

          <Text style={[s.title, { color: theme.text }]}>Check your inbox</Text>
          <Text style={[s.sub, { color: theme.textSecondary }]}>We sent a 6-digit code to</Text>
          <View style={s.emailChip}>
            <Ionicons name="mail-outline" size={14} color={COLORS.primary} />
            <Text style={s.emailText}>{email}</Text>
          </View>

          {/* OTP cells */}
          <View style={s.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={r => { inputs.current[i] = r! }}
                style={[
                  s.otpCell,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    color: theme.text,
                  },
                  !!digit && {
                    borderColor: COLORS.primary,
                    backgroundColor: COLORS.primaryLight,
                    color: COLORS.primary,
                  },
                  loading && { opacity: 0.6 },
                ]}
                value={digit}
                onChangeText={v => handleChange(v, i)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                autoFocus={i === 0}
              />
            ))}
          </View>

          {/* Progress bar */}
          <View style={[s.progressBar, { backgroundColor: theme.border }]}>
            <View style={[s.progressFill, { width: `${(filled / OTP_LENGTH) * 100}%` as any }]} />
          </View>

          {/* Verify button */}
          <TouchableOpacity
            style={[s.verifyBtn, (loading || filled < OTP_LENGTH) && s.btnDisabled]}
            onPress={() => handleVerify()}
            disabled={loading || filled < OTP_LENGTH}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={filled === OTP_LENGTH ? ['#5B5FED', '#7C3AED'] : [theme.border, theme.border]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.verifyGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={[s.verifyText, filled < OTP_LENGTH && { color: theme.textSecondary }]}>
                    Verify & Sign In
                  </Text>
                  {filled === OTP_LENGTH && <Ionicons name="checkmark" size={18} color="#fff" />}
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={s.resendRow}>
            <Text style={[s.resendLabel, { color: theme.textSecondary }]}>Didn't receive it? </Text>
            {resendTimer > 0
              ? <Text style={[s.resendTimer, { color: theme.textTertiary }]}>Resend in {resendTimer}s</Text>
              : <TouchableOpacity onPress={handleResend}>
                <Text style={s.resendLink}>Resend code</Text>
              </TouchableOpacity>
            }
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  backBtn: {
    margin: SPACING.lg, width: 40, height: 40,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...SHADOW.sm,
  },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  iconGrad: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xl, ...SHADOW.md },
  title: { fontSize: FONT_SIZE['2xl'], fontWeight: '800', marginBottom: 8 },
  sub: { fontSize: FONT_SIZE.md, marginBottom: SPACING.sm },
  emailChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primaryLight, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full, marginBottom: SPACING.xl,
  },
  emailText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '600' },
  otpRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.md },
  otpCell: {
    width: 46, height: 58, borderRadius: BORDER_RADIUS.md,
    borderWidth: 2, textAlign: 'center',
    fontSize: FONT_SIZE.xl, fontWeight: '800',
  },
  progressBar: { width: '100%', height: 3, borderRadius: 2, marginBottom: SPACING.xl, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  verifyBtn: { width: '100%', borderRadius: BORDER_RADIUS.md, overflow: 'hidden', ...SHADOW.md, marginBottom: SPACING.lg },
  btnDisabled: { shadowOpacity: 0 },
  verifyGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, gap: 8 },
  verifyText: { fontSize: FONT_SIZE.md, fontWeight: '700' },  // color set inline
  resendRow: { flexDirection: 'row', alignItems: 'center' },
  resendLabel: { fontSize: FONT_SIZE.sm },
  resendTimer: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  resendLink: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '700' },
})