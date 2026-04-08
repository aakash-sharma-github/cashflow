// src/screens/VerifyOtpScreen.tsx — Redesigned v2
import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../store/authStore'
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

  useEffect(() => {
    if (resendTimer <= 0) return
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [resendTimer])

  const handleChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    if (value && index < OTP_LENGTH - 1) inputs.current[index + 1]?.focus()
    if (newOtp.every(v => v !== '') && newOtp.join('').length === OTP_LENGTH) {
      handleVerify(newOtp.join(''))
    }
  }

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) inputs.current[index - 1]?.focus()
  }

  const handleVerify = async (code?: string) => {
    const token = code || otp.join('')
    if (token.length < OTP_LENGTH) { Alert.alert('Incomplete', 'Please enter the 6-digit code.'); return }
    setLoading(true)
    const { error } = await verifyOtp(email, token)
    setLoading(false)
    if (error) {
      Alert.alert('Invalid Code', 'The code is incorrect or expired.')
      setOtp(Array(OTP_LENGTH).fill(''))
      inputs.current[0]?.focus()
    }
  }

  const handleResend = async () => {
    setResendTimer(60)
    setOtp(Array(OTP_LENGTH).fill(''))
    inputs.current[0]?.focus()
    const { error } = await sendOtp(email)
    if (error) Alert.alert('Error', 'Could not resend code.')
  }

  const filled = otp.filter(v => v !== '').length

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>

        <View style={styles.content}>
          {/* Icon */}
          <LinearGradient colors={['#5B5FED', '#7C3AED']} style={styles.iconGrad}>
            <Ionicons name="mail" size={32} color="#fff" />
          </LinearGradient>

          <Text style={styles.title}>Check your inbox</Text>
          <Text style={styles.sub}>We sent a 6-digit code to</Text>
          <View style={styles.emailChip}>
            <Ionicons name="mail-outline" size={14} color={COLORS.primary} />
            <Text style={styles.emailText}>{email}</Text>
          </View>

          {/* OTP cells */}
          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={r => { inputs.current[i] = r! }}
                style={[styles.otpCell, digit && styles.otpCellFilled, loading && styles.otpCellLoading]}
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
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${(filled / OTP_LENGTH) * 100}%` }]} />
          </View>

          <TouchableOpacity
            style={[styles.verifyBtn, (loading || filled < OTP_LENGTH) && styles.btnDisabled]}
            onPress={() => handleVerify()}
            disabled={loading || filled < OTP_LENGTH}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={filled === OTP_LENGTH ? ['#5B5FED', '#7C3AED'] : ['#D1D5DB', '#D1D5DB']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.verifyGradient}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Text style={[styles.verifyText, filled < OTP_LENGTH && { color: COLORS.textSecondary }]}>
                      Verify & Sign In
                    </Text>
                    {filled === OTP_LENGTH && <Ionicons name="checkmark" size={18} color="#fff" />}
                  </>
              }
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive it? </Text>
            {resendTimer > 0
              ? <Text style={styles.resendTimer}>Resend in {resendTimer}s</Text>
              : <TouchableOpacity onPress={handleResend}>
                  <Text style={styles.resendLink}>Resend code</Text>
                </TouchableOpacity>
            }
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  backBtn: {
    margin: SPACING.lg,
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW.sm,
  },
  content: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: SPACING.lg },
  iconGrad: {
    width: 72, height: 72, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.xl,
    ...SHADOW.md,
  },
  title: { fontSize: FONT_SIZE['2xl'], fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  sub: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  emailChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.xl,
  },
  emailText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '600' },
  otpRow: { flexDirection: 'row', gap: 10, marginBottom: SPACING.md },
  otpCell: {
    width: 46, height: 58,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 2, borderColor: COLORS.border,
    textAlign: 'center', fontSize: FONT_SIZE.xl, fontWeight: '800',
    color: COLORS.text, backgroundColor: COLORS.surface,
  },
  otpCellFilled: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight, color: COLORS.primary },
  otpCellLoading: { opacity: 0.6 },
  progressBar: {
    width: '100%', height: 3, backgroundColor: COLORS.border,
    borderRadius: 2, marginBottom: SPACING.xl, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  verifyBtn: { width: '100%', borderRadius: BORDER_RADIUS.md, overflow: 'hidden', ...SHADOW.md, marginBottom: SPACING.lg },
  btnDisabled: { shadowOpacity: 0 },
  verifyGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, gap: 8 },
  verifyText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },
  resendRow: { flexDirection: 'row', alignItems: 'center' },
  resendLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  resendTimer: { fontSize: FONT_SIZE.sm, color: COLORS.textTertiary, fontWeight: '600' },
  resendLink: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '700' },
})
