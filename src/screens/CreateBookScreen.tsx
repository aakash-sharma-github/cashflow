// src/screens/CreateBookScreen.tsx
// Dark mode fix: presentation:'modal' on Android uses a separate window surface
// whose background is controlled by the Android theme (white), not React props.
// contentStyle only works on iOS modals. Fix: use Platform to switch presentation,
// and add backgroundColor to every container + ScrollView contentContainerStyle.
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useBooksStore } from "../store/booksStore";
import { useThemeStore, getTheme } from "../store/themeStore";
import { themedAlert } from "../components/common/ThemedAlert";
import {
  COLORS,
  SPACING,
  BORDER_RADIUS,
  FONT_SIZE,
  SHADOW,
  BOOK_COLORS,
  CURRENCIES,
} from "../constants";

export default function CreateBookScreen({ navigation, route }: any) {
  const editBook = route.params?.book;
  const isEditing = !!editBook;

  const [name, setName] = useState(editBook?.name || "");
  const [nameFocused, setNameFocused] = useState(false);
  const [descFocused, setDescFocused] = useState(false);
  const [description, setDescription] = useState(editBook?.description || "");
  const [color, setColor] = useState(editBook?.color || BOOK_COLORS[0]);
  const [currency, setCurrency] = useState(editBook?.currency || "USD");
  const [loading, setLoading] = useState(false);

  const { createBook, updateBook } = useBooksStore();
  const { mode } = useThemeStore();
  const theme = getTheme(mode);

  const handleSave = async () => {
    if (!name.trim()) {
      themedAlert("Required", "Please enter a book name.");
      return;
    }
    setLoading(true);
    const formData = { name, description, color, currency };
    const { error } = isEditing
      ? await updateBook(editBook.id, formData)
      : await createBook(formData);
    setLoading(false);
    if (error) {
      themedAlert("Error", error);
      return;
    }
    navigation.goBack();
  };

  const currencySymbol =
    CURRENCIES.find((c) => c.code === currency)?.symbol || currency;
  const bg = theme.background;

  return (
    // CRITICAL: wrap everything in a View with backgroundColor BEFORE SafeAreaView
    // This fills the Android window surface gap that SafeAreaView can't reach
    <View style={{ flex: 1, backgroundColor: bg }}>
      <SafeAreaView
        style={[s.safe, { backgroundColor: bg }]}
        edges={["bottom"]}
      >
        <ScrollView
          // contentContainerStyle background fills bounce area on iOS & body on Android
          contentContainerStyle={[s.scroll, { backgroundColor: bg }]}
          style={{ backgroundColor: bg }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Live preview card */}
          <LinearGradient
            colors={[color, color + "CC"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.preview}
          >
            <View style={s.previewDeco} />
            <View style={s.previewIconWrap}>
              <Ionicons name="book-outline" size={22} color="#fff" />
            </View>
            <Text style={s.previewName} numberOfLines={1}>
              {name || "Book Name"}
            </Text>
            {description ? (
              <Text style={s.previewDesc} numberOfLines={1}>
                {description}
              </Text>
            ) : null}
            <Text style={s.previewBalance}>{currencySymbol}0.00</Text>
          </LinearGradient>

          {/* Name */}
          <View style={s.section}>
            <Text style={[s.label, { color: theme.textSecondary }]}>
              Book Name *
            </Text>
            <View
              style={[
                s.inputWrap,
                { backgroundColor: theme.surface, borderColor: theme.border },
                nameFocused && {
                  borderColor: COLORS.primary,
                  backgroundColor: COLORS.primaryLight,
                },
              ]}
            >
              <Ionicons
                name="text-outline"
                size={17}
                color={nameFocused ? COLORS.primary : theme.textTertiary}
                style={{ marginRight: 10 }}
              />
              <TextInput
                style={[s.input, { color: theme.text }]}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Personal, Business..."
                placeholderTextColor={theme.textTertiary}
                maxLength={50}
                autoFocus
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
              />
            </View>
          </View>

          {/* Description */}
          <View style={s.section}>
            <Text style={[s.label, { color: theme.textSecondary }]}>
              Description (optional)
            </Text>
            <View
              style={[
                s.inputWrap,
                { backgroundColor: theme.surface, borderColor: theme.border },
                descFocused && {
                  borderColor: COLORS.primary,
                  backgroundColor: COLORS.primaryLight,
                },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={17}
                color={descFocused ? COLORS.primary : theme.textTertiary}
                style={{ marginRight: 10 }}
              />
              <TextInput
                style={[s.input, { color: theme.text }]}
                value={description}
                onChangeText={setDescription}
                placeholder="What is this book for?"
                placeholderTextColor={theme.textTertiary}
                maxLength={100}
                onFocus={() => setDescFocused(true)}
                onBlur={() => setDescFocused(false)}
              />
            </View>
          </View>

          {/* Color */}
          <View style={s.section}>
            <Text style={[s.label, { color: theme.textSecondary }]}>Color</Text>
            <View style={s.colorGrid}>
              {BOOK_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    s.colorSwatch,
                    { backgroundColor: c },
                    color === c && s.colorSwatchActive,
                  ]}
                  onPress={() => setColor(c)}
                  activeOpacity={0.8}
                >
                  {color === c && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Currency */}
          <View style={s.section}>
            <Text style={[s.label, { color: theme.textSecondary }]}>
              Currency
            </Text>
            <View style={s.currencyGrid}>
              {CURRENCIES.map((curr) => {
                const active = currency === curr.code;
                return (
                  <TouchableOpacity
                    key={curr.code}
                    style={[
                      s.currencyChip,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                      },
                      active && {
                        borderColor: COLORS.primary,
                        backgroundColor: COLORS.primaryLight,
                      },
                    ]}
                    onPress={() => setCurrency(curr.code)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        s.currSymbol,
                        {
                          color: active ? COLORS.primary : theme.textSecondary,
                        },
                      ]}
                    >
                      {curr.symbol}
                    </Text>
                    <Text
                      style={[
                        s.currCode,
                        {
                          color: active ? COLORS.primary : theme.textSecondary,
                          fontWeight: active ? "700" : "400",
                        },
                      ]}
                    >
                      {curr.code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[s.saveBtn, { opacity: loading ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={[color, color + "CC"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.saveBtnGrad}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={isEditing ? "checkmark" : "add"}
                    size={20}
                    color="#fff"
                  />
                  <Text style={s.saveBtnText}>
                    {isEditing ? "Save Changes" : "Create Book"}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xl },

  preview: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    overflow: "hidden",
    ...SHADOW.lg,
  },
  previewDeco: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.1)",
    top: -50,
    right: -30,
  },
  previewIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  previewName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 2,
  },
  previewDesc: {
    fontSize: FONT_SIZE.xs,
    color: "rgba(255,255,255,0.75)",
    marginBottom: SPACING.sm,
  },
  previewBalance: {
    fontSize: FONT_SIZE["3xl"],
    fontWeight: "900",
    color: "#fff",
    letterSpacing: -1,
    marginTop: SPACING.sm,
  },

  section: { marginBottom: SPACING.lg },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: "700",
    marginBottom: SPACING.sm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    paddingHorizontal: SPACING.md,
    height: 50,
  },
  input: { flex: 1, fontSize: FONT_SIZE.md },

  colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchActive: {
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    transform: [{ scale: 1.15 }],
  },

  currencyGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  currencyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
  },
  currSymbol: { fontSize: FONT_SIZE.md, fontWeight: "700" },
  currCode: { fontSize: FONT_SIZE.sm },

  saveBtn: { borderRadius: BORDER_RADIUS.lg, overflow: "hidden", ...SHADOW.md },
  saveBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: SPACING.sm,
  },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: "700", color: "#fff" },
});
