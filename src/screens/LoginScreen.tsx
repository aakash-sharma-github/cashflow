// src/screens/LoginScreen.tsx — Redesigned v2
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ImageBackground,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import AppLogo from "../components/common/AppLogo";
import { useAuthStore } from "../store/authStore";
import { themedAlert } from "../components/common/ThemedAlert";
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  FONT_SIZE,
  SHADOW,
} from "../constants";
import { useThemeStore, getTheme } from "../store/themeStore";
import { isValidEmail } from "../utils";

const { height } = Dimensions.get("window");

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const { mode } = useThemeStore();
  const theme = getTheme(mode);

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      themedAlert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    setLoading(true);
    const { error } = await sendOtp(trimmedEmail);
    setLoading(false);
    if (error) {
      themedAlert("Error", error);
      return;
    }
    navigation.navigate("VerifyOtp", { email: trimmedEmail });
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      // Only show error — success is handled by onAuthStateChange in authStore
      if (error && error !== "cancelled") {
        themedAlert("Google Sign-In Failed", error);
      }
    } finally {
      // Always reset loading — prevents stuck spinner if component stays mounted
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Top hero gradient */}
      <LinearGradient
        colors={["#5B5FED", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        {/* Decorative circles */}
        <View style={styles.circle1} />
        <View style={styles.circle2} />
        <View style={styles.circle3} />

        <View style={styles.heroContent}>
          <AppLogo size={64} style={{ marginBottom: SPACING.md }} />
          <Text style={styles.appName}>CashFlow</Text>
          <Text style={styles.tagline}>
            Smart money tracking,{"\n"}built for teams.
          </Text>
        </View>
      </LinearGradient>

      {/* Bottom card */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.cardWrap}
      >
        <View style={[styles.card, { backgroundColor: theme.background }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Welcome back
          </Text>
          <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
            Sign in to your account
          </Text>

          {/* Google button */}
          <TouchableOpacity
            style={[
              styles.googleBtn,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={handleGoogle}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#EA4335" />
                <Text style={[styles.googleBtnText, { color: theme.text }]}>
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View
              style={[styles.dividerLine, { backgroundColor: theme.border }]}
            />
            <Text style={[styles.dividerText, { color: theme.textTertiary }]}>
              or use email
            </Text>
            <View
              style={[styles.dividerLine, { backgroundColor: theme.border }]}
            />
          </View>

          {/* Email input */}
          <View
            style={[
              styles.inputWrap,
              { backgroundColor: theme.surface, borderColor: theme.border },
              emailFocused && {
                borderColor: COLORS.primary,
                backgroundColor: mode === 'dark'
                  ? theme.surfaceSecondary   // darker surface for dark mode
                  : COLORS.primaryLight      // keep light for light mode
              }
            ]}
          >
            <Ionicons
              name="mail-outline"
              size={18}
              color={emailFocused ? COLORS.primary : COLORS.textTertiary}
              style={styles.inputIcon}
            />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              placeholderTextColor={COLORS.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              onSubmitEditing={handleSendOtp}
              returnKeyType="go"
            />
          </View>

          {/* OTP button */}
          <TouchableOpacity
            style={[styles.otpBtn, loading && styles.btnDisabled]}
            onPress={handleSendOtp}
            disabled={loading}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={["#5B5FED", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.otpBtnGradient}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.otpBtnText}>Send Code</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.disclaimerRow}>
            <Text style={[styles.disclaimer, { color: theme.textTertiary }]}>
              By continuing you agree to our{" "}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("Terms")}
              activeOpacity={0.7}
            >
              <Text style={styles.disclaimerLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={[styles.disclaimer, { color: theme.textTertiary }]}>
              {" "}
              &amp;{" "}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("PrivacyPolicy")}
              activeOpacity={0.7}
            >
              <Text style={styles.disclaimerLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#5B5FED" },
  hero: {
    height: height * 0.42,
    justifyContent: "flex-end",
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    overflow: "hidden",
  },
  circle1: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.07)",
    top: -60,
    right: -40,
  },
  circle2: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.05)",
    top: 40,
    right: 60,
  },
  circle3: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: 80,
    left: -20,
  },
  heroContent: { zIndex: 1 },
  logoWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  appName: {
    fontSize: FONT_SIZE["2xl"],
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: FONT_SIZE.md,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 22,
  },

  cardWrap: { flex: 1 },
  card: {
    flex: 1,
    // backgroundColor set inline via theme
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: SPACING.xl,
    paddingTop: SPACING.xl + 4,
  },
  cardTitle: { fontSize: FONT_SIZE["2xl"], fontWeight: "800", marginBottom: 4 },
  cardSub: { fontSize: FONT_SIZE.sm, marginBottom: SPACING.xl },

  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 14,
    borderWidth: 1.5,
    ...SHADOW.sm,
    marginBottom: SPACING.lg,
  },
  googleBtnText: { fontSize: FONT_SIZE.md, fontWeight: "600" },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: FONT_SIZE.xs, fontWeight: "500" },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    height: 52,
  },
  inputWrapFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  inputIcon: { marginRight: SPACING.sm },
  input: { flex: 1, fontSize: FONT_SIZE.md },

  otpBtn: {
    borderRadius: BORDER_RADIUS.md,
    overflow: "hidden",
    marginBottom: SPACING.md,
    ...SHADOW.md,
  },
  btnDisabled: { opacity: 0.65 },
  otpBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    gap: SPACING.sm,
  },
  otpBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },

  disclaimerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 4,
  },
  disclaimer: { fontSize: FONT_SIZE.xs, lineHeight: 18 },
  disclaimerLink: { color: COLORS.primary, fontWeight: "600" },
});
