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
  Alert,
  ImageBackground,
  Dimensions,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../store/authStore";
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  FONT_SIZE,
  SHADOW,
} from "../constants";
import { isValidEmail } from "../utils";

const { height } = Dimensions.get("window");

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const sendOtp = useAuthStore((s) => s.sendOtp);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  const handleSendOtp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }
    setLoading(true);
    const { error } = await sendOtp(trimmedEmail);
    setLoading(false);
    if (error) {
      Alert.alert("Error", error);
      return;
    }
    navigation.navigate("VerifyOtp", { email: trimmedEmail });
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    setGoogleLoading(false);
    if (error && error !== "cancelled")
      Alert.alert("Google Sign-In Failed", error);
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
          <View style={styles.logoWrap}>
            {/* <Ionicons name="wallet" size={32} color="#fff" /> */}
            <Image
              source={require("../../assets/icon.png")}
              style={{ width: 32, height: 32 }}
            />
          </View>
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
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSub}>Sign in to your account</Text>

          {/* Google button */}
          <TouchableOpacity
            style={styles.googleBtn}
            onPress={handleGoogle}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#EA4335" />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or use email</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email input */}
          <View
            style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}
          >
            <Ionicons
              name="mail-outline"
              size={18}
              color={emailFocused ? COLORS.primary : COLORS.textTertiary}
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
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

          <Text style={styles.disclaimer}>
            By continuing you agree to our{" "}
            <Text style={styles.disclaimerLink}>Terms</Text> &{" "}
            <Text style={styles.disclaimerLink}>Privacy Policy</Text>
          </Text>
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
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: SPACING.xl,
    paddingTop: SPACING.xl + 4,
  },
  cardTitle: {
    fontSize: FONT_SIZE["2xl"],
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },

  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOW.sm,
    marginBottom: SPACING.lg,
  },
  googleBtnText: {
    fontSize: FONT_SIZE.md,
    fontWeight: "600",
    color: COLORS.text,
  },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    fontWeight: "500",
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    height: 52,
  },
  inputWrapFocused: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  inputIcon: { marginRight: SPACING.sm },
  input: { flex: 1, fontSize: FONT_SIZE.md, color: COLORS.text },

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

  disclaimer: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    textAlign: "center",
    lineHeight: 18,
  },
  disclaimerLink: { color: COLORS.primary, fontWeight: "600" },
});
