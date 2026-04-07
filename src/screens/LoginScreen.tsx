// src/screens/LoginScreen.tsx
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../store/authStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { isValidEmail } from '../utils'

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const sendOtp = useAuthStore(s => s.sendOtp)

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase()
    if (!isValidEmail(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.')
      return
    }

    setLoading(true)
    const { error } = await sendOtp(trimmedEmail)
    setLoading(false)

    if (error) {
      Alert.alert('Error', error)
      return
    }

    navigation.navigate('VerifyOtp', { email: trimmedEmail })
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>💰</Text>
          </View>
          <Text style={styles.appName}>CashFlow</Text>
          <Text style={styles.tagline}>Track. Collaborate. Stay clear.</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.subheading}>
            We'll send a 6-digit code to your email. No password needed.
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onSubmitEditing={handleSendOtp}
              returnKeyType="go"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Send Code →</Text>
            }
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
    justifyContent: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: SPACING['2xl'],
  },
  logoIcon: {
    width: 72,
    height: 72,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    ...SHADOW.md,
  },
  logoEmoji: {
    fontSize: 36,
  },
  appName: {
    fontSize: FONT_SIZE['3xl'],
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  form: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOW.md,
  },
  heading: {
    fontSize: FONT_SIZE['2xl'],
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subheading: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    marginBottom: SPACING.lg,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    ...SHADOW.sm,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: COLORS.textInverse,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  disclaimer: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    textAlign: 'center',
    marginTop: SPACING.md,
    lineHeight: 18,
  },
})
