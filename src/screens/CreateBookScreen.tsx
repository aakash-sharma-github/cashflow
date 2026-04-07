// src/screens/CreateBookScreen.tsx
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useBooksStore } from '../store/booksStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW, BOOK_COLORS, CURRENCIES } from '../constants'

export default function CreateBookScreen({ navigation, route }: any) {
  const editBook = route.params?.book
  const isEditing = !!editBook

  const [name, setName] = useState(editBook?.name || '')
  const [description, setDescription] = useState(editBook?.description || '')
  const [color, setColor] = useState(editBook?.color || BOOK_COLORS[0])
  const [currency, setCurrency] = useState(editBook?.currency || 'USD')
  const [loading, setLoading] = useState(false)

  const { createBook, updateBook } = useBooksStore()

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a book name.')
      return
    }

    setLoading(true)
    const formData = { name, description, color, currency }

    const { error } = isEditing
      ? await updateBook(editBook.id, formData)
      : await createBook(formData)

    setLoading(false)

    if (error) {
      Alert.alert('Error', error)
      return
    }

    navigation.goBack()
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Book Preview */}
        <View style={[styles.preview, { backgroundColor: color }]}>
          <Text style={styles.previewName}>{name || 'Book Name'}</Text>
          <Text style={styles.previewSub}>{description || 'Your new ledger'}</Text>
          <Text style={styles.previewBalance}>$0.00</Text>
        </View>

        {/* Name */}
        <View style={styles.field}>
          <Text style={styles.label}>Book Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Personal, Business, Family..."
            placeholderTextColor={COLORS.textTertiary}
            maxLength={50}
            autoFocus
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="What is this book for?"
            placeholderTextColor={COLORS.textTertiary}
            maxLength={100}
          />
        </View>

        {/* Color Picker */}
        <View style={styles.field}>
          <Text style={styles.label}>Color</Text>
          <View style={styles.colorRow}>
            {BOOK_COLORS.map(c => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: c },
                  color === c && styles.colorSwatchActive,
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        {/* Currency */}
        <View style={styles.field}>
          <Text style={styles.label}>Currency</Text>
          <View style={styles.currencyGrid}>
            {CURRENCIES.map(curr => (
              <TouchableOpacity
                key={curr.code}
                style={[
                  styles.currencyChip,
                  currency === curr.code && styles.currencyChipActive,
                ]}
                onPress={() => setCurrency(curr.code)}
              >
                <Text style={[
                  styles.currencySymbol,
                  currency === curr.code && styles.currencySymbolActive,
                ]}>
                  {curr.symbol}
                </Text>
                <Text style={[
                  styles.currencyCode,
                  currency === curr.code && styles.currencyCodeActive,
                ]}>
                  {curr.code}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: color }, loading && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>
                {isEditing ? 'Save Changes' : 'Create Book'}
              </Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl },

  preview: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
    ...SHADOW.md,
  },
  previewName: { fontSize: FONT_SIZE['2xl'], fontWeight: '800', color: '#fff', marginBottom: 4 },
  previewSub: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.8)', marginBottom: SPACING.md },
  previewBalance: { fontSize: FONT_SIZE['3xl'], fontWeight: '800', color: '#fff', letterSpacing: -1 },

  field: { marginBottom: SPACING.lg },
  label: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },

  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  colorSwatch: {
    width: 36, height: 36,
    borderRadius: BORDER_RADIUS.full,
  },
  colorSwatchActive: {
    borderWidth: 3,
    borderColor: COLORS.text,
    transform: [{ scale: 1.2 }],
  },

  currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  currencyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 4,
  },
  currencyChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  currencySymbol: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.textSecondary },
  currencySymbolActive: { color: COLORS.primary },
  currencyCode: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  currencyCodeActive: { color: COLORS.primary, fontWeight: '700' },

  saveBtn: {
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    marginTop: SPACING.lg,
    ...SHADOW.md,
  },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },
})
