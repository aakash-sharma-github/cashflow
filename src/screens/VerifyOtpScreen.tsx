// src/screens/VerifyOtpScreen.tsx
import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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

  // Countdown timer for resend
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

    if (value && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus()
    }

    // Auto-submit when all filled
    if (newOtp.every(v => v !== '') && newOtp.join('').length === OTP_LENGTH) {
      handleVerify(newOtp.join(''))
    }
  }

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus()
    }
  }

  const handleVerify = async (code?: string) => {
    const token = code || otp.join('')
    if (token.length < OTP_LENGTH) {
      Alert.alert('Incomplete', 'Please enter the 6-digit code.')
      return
    }

    setLoading(true)
    const { error } = await verifyOtp(email, token)
    setLoading(false)

    if (error) {
      Alert.alert('Invalid Code', 'The code is incorrect or expired. Please try again.')
      setOtp(Array(OTP_LENGTH).fill(''))
      inputs.current[0]?.focus()
    }
    // Navigation is handled by the auth state change in RootNavigator
  }

  const handleResend = async () => {
    setResendTimer(60)
    setOtp(Array(OTP_LENGTH).fill(''))
    inputs.current[0]?.focus()
    const { error } = await sendOtp(email)
    if (error) Alert.alert('Error', 'Could not resend code. Please try again.')
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>📬</Text>
          </View>

          <Text style={styles.heading}>Check your email</Text>
          <Text style={styles.subheading}>
            We sent a 6-digit code to{'\n'}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

          {/* OTP Input */}
          <View style={styles.otpRow}>
            {otp.map((digit, i) => (
              <TextInput
                key={i}
                ref={r => { inputs.current[i] = r! }}
                style={[styles.otpCell, digit ? styles.otpCellFilled : null]}
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

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => handleVerify()}
            disabled={loading || otp.some(v => !v)}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Verify & Sign In</Text>
            }
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive the code? </Text>
            {resendTimer > 0 ? (
              <Text style={styles.resendTimer}>Resend in {resendTimer}s</Text>
            ) : (
              <TouchableOpacity onPress={handleResend}>
                <Text style={styles.resendLink}>Resend code</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, paddingHorizontal: SPACING.lg },
  backBtn: { paddingVertical: SPACING.md },
  backText: { fontSize: FONT_SIZE.md, color: COLORS.primary, fontWeight: '600' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  iconContainer: {
    width: 80, height: 80,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
    ...SHADOW.sm,
  },
  icon: { fontSize: 40 },
  heading: {
    fontSize: FONT_SIZE['2xl'],
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subheading: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  emailHighlight: { fontWeight: '700', color: COLORS.text },
  otpRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  otpCell: {
    width: 48, height: 56,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    textAlign: 'center',
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  otpCellFilled: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md + 2,
    paddingHorizontal: SPACING.xl + SPACING.lg,
    alignItems: 'center',
    width: '100%',
    ...SHADOW.sm,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#fff',
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  resendLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  resendTimer: { fontSize: FONT_SIZE.sm, color: COLORS.textTertiary, fontWeight: '600' },
  resendLink: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '700' },
})
