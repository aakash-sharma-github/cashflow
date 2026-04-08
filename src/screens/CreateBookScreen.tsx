// src/screens/CreateBookScreen.tsx — Redesigned v2
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useBooksStore } from '../store/booksStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW, BOOK_COLORS, CURRENCIES } from '../constants'

const BOOK_ICONS = ['book-outline', 'briefcase-outline', 'home-outline', 'cart-outline', 'airplane-outline', 'heart-outline', 'restaurant-outline', 'car-outline']

export default function CreateBookScreen({ navigation, route }: any) {
  const editBook = route.params?.book
  const isEditing = !!editBook

  const [name, setName] = useState(editBook?.name || '')
  const [nameFocused, setNameFocused] = useState(false)
  const [description, setDescription] = useState(editBook?.description || '')
  const [color, setColor] = useState(editBook?.color || BOOK_COLORS[0])
  const [currency, setCurrency] = useState(editBook?.currency || 'USD')
  const [loading, setLoading] = useState(false)
  const { createBook, updateBook } = useBooksStore()

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Please enter a book name.'); return }
    setLoading(true)
    const formData = { name, description, color, currency }
    const { error } = isEditing ? await updateBook(editBook.id, formData) : await createBook(formData)
    setLoading(false)
    if (error) { Alert.alert('Error', error); return }
    navigation.goBack()
  }

  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol || currency

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Live preview card */}
        <LinearGradient colors={[color, color + 'CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.preview}>
          <View style={styles.previewDeco} />
          <View style={styles.previewIconWrap}>
            <Ionicons name="book-outline" size={22} color="#fff" />
          </View>
          <Text style={styles.previewName} numberOfLines={1}>{name || 'Book Name'}</Text>
          {description ? <Text style={styles.previewDesc} numberOfLines={1}>{description}</Text> : null}
          <Text style={styles.previewBalance}>{currencySymbol}0.00</Text>
        </LinearGradient>

        {/* Name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Book Name *</Text>
          <View style={[styles.inputWrap, nameFocused && styles.inputFocused]}>
            <Ionicons name="text-outline" size={17} color={nameFocused ? COLORS.primary : COLORS.textTertiary} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Personal, Business..."
              placeholderTextColor={COLORS.textTertiary}
              maxLength={50}
              autoFocus
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
            />
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Description (optional)</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="information-circle-outline" size={17} color={COLORS.textTertiary} style={{ marginRight: 10 }} />
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="What is this book for?"
              placeholderTextColor={COLORS.textTertiary}
              maxLength={100}
            />
          </View>
        </View>

        {/* Color */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.colorGrid}>
            {BOOK_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSwatchActive]}
                onPress={() => setColor(c)}
              >
                {color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Currency */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Currency</Text>
          <View style={styles.currencyGrid}>
            {CURRENCIES.map(curr => (
              <TouchableOpacity
                key={curr.code}
                style={[styles.currencyChip, currency === curr.code && styles.currencyChipActive]}
                onPress={() => setCurrency(curr.code)}
              >
                <Text style={[styles.currencySymbol, currency === curr.code && styles.currencySymbolActive]}>{curr.symbol}</Text>
                <Text style={[styles.currencyCode, currency === curr.code && styles.currencyCodeActive]}>{curr.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, { opacity: loading ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.88}
        >
          <LinearGradient colors={[color, color + 'CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.saveBtnGrad}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name={isEditing ? 'checkmark' : 'add'} size={20} color="#fff" />
                <Text style={styles.saveBtnText}>{isEditing ? 'Save Changes' : 'Create Book'}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xl },

  preview: {
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl,
    marginBottom: SPACING.xl, overflow: 'hidden', ...SHADOW.lg,
  },
  previewDeco: { position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(255,255,255,0.1)', top: -50, right: -30 },
  previewIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  previewName: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: '#fff', marginBottom: 2 },
  previewDesc: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.75)', marginBottom: SPACING.sm },
  previewBalance: { fontSize: FONT_SIZE['3xl'], fontWeight: '900', color: '#fff', letterSpacing: -1, marginTop: SPACING.sm },

  section: { marginBottom: SPACING.lg },
  sectionLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, height: 50,
  },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  input: { flex: 1, fontSize: FONT_SIZE.md, color: COLORS.text },

  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  colorSwatch: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colorSwatchActive: { borderWidth: 3, borderColor: COLORS.text, transform: [{ scale: 1.15 }] },

  currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  currencyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  currencyChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  currencySymbol: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.textSecondary },
  currencySymbolActive: { color: COLORS.primary },
  currencyCode: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  currencyCodeActive: { color: COLORS.primary, fontWeight: '700' },

  saveBtn: { borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', ...SHADOW.md },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: SPACING.sm },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },
})
