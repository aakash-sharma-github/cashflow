// src/screens/CreateBookScreen.tsx — Redesigned: minimal, just a name field
// Removed: color picker, description, live preview card — all too bulky
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useBooksStore } from '../store/booksStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { themedAlert } from '../components/common/ThemedAlert'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, CURRENCIES } from '../constants'

// Book name suggestions (like CashBook)
const SUGGESTIONS = [
  'Personal Expenses', 'Business Expenses', 'Shop Expenses',
  'Home Expenses', 'Travel Expenses', 'Project Book',
  'Purchase Order', 'Client Record', 'Petty Cash',
]

export default function CreateBookScreen({ navigation, route }: any) {
  const editBook = route.params?.book
  const isEditing = !!editBook

  const [name, setName] = useState(editBook?.name || '')
  const [currency, setCurrency] = useState(editBook?.currency || 'USD')
  const [loading, setLoading] = useState(false)
  const [focused, setFocused] = useState(false)

  const { createBook, updateBook } = useBooksStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)
  const bg = theme.background

  const handleSave = async () => {
    if (!name.trim()) { themedAlert('Required', 'Please enter a book name.'); return }
    setLoading(true)
    const formData = { name: name.trim(), description: '', color: '#5B5FED', currency }
    const { error } = isEditing
      ? await updateBook(editBook.id, formData)
      : await createBook(formData)
    setLoading(false)
    if (error) { themedAlert('Error', error); return }
    navigation.goBack()
  }

  // Filter suggestions based on input
  const filteredSuggestions = name.length > 0
    ? SUGGESTIONS.filter(s => s.toLowerCase().includes(name.toLowerCase()) && s !== name)
    : SUGGESTIONS

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <SafeAreaView style={[s.safe, { backgroundColor: bg }]} edges={['bottom']}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.closeBtn}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: theme.text }]}>
            {isEditing ? 'Edit Book' : 'Add New Book'}
          </Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          style={{ backgroundColor: bg }}
          contentContainerStyle={[s.scroll, { backgroundColor: bg }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Book name input */}
          <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Enter Book Name</Text>
          <View style={[
            s.inputWrap,
            { borderColor: focused ? COLORS.primary : theme.border, backgroundColor: theme.surface },
          ]}>
            <TextInput
              style={[s.input, { color: theme.text }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Shop Expenses"
              placeholderTextColor={theme.textTertiary}
              autoFocus
              maxLength={50}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>

          {/* Suggestions */}
          {filteredSuggestions.length > 0 && (
            <View style={s.suggestionsSection}>
              <Text style={[s.suggestionsLabel, { color: theme.textTertiary }]}>Suggestions</Text>
              <View style={s.suggestionsWrap}>
                {filteredSuggestions.slice(0, 6).map(sug => (
                  <TouchableOpacity
                    key={sug}
                    style={[s.chip, { borderColor: theme.border, backgroundColor: theme.surface }]}
                    onPress={() => setName(sug)}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipText, { color: theme.textSecondary }]}>{sug}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Currency selector */}
          <Text style={[s.fieldLabel, { color: theme.textSecondary, marginTop: SPACING.lg }]}>
            Currency
          </Text>
          <View style={s.currencyRow}>
            {CURRENCIES.map(curr => (
              <TouchableOpacity
                key={curr.code}
                style={[
                  s.currChip,
                  { borderColor: theme.border, backgroundColor: theme.surface },
                  currency === curr.code && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
                ]}
                onPress={() => setCurrency(curr.code)}
                activeOpacity={0.8}
              >
                <Text style={[
                  s.currChipText,
                  { color: currency === curr.code ? COLORS.primary : theme.textSecondary },
                ]}>
                  {curr.symbol} {curr.code}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

        </ScrollView>

        {/* Add button — pinned at bottom */}
        <View style={[s.bottomBar, { backgroundColor: bg, borderTopColor: theme.border }]}>
          <TouchableOpacity
            style={[
              s.addBtn,
              { backgroundColor: COLORS.primary },
              (!name.trim() || loading) && { opacity: 0.5 },
            ]}
            onPress={handleSave}
            disabled={loading || !name.trim()}
            activeOpacity={0.88}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="add" size={20} color="#fff" />
                <Text style={s.addBtnText}>
                  {isEditing ? 'SAVE CHANGES' : 'ADD NEW BOOK'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: FONT_SIZE.md, fontWeight: '700' },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  scroll: { padding: SPACING.lg, paddingBottom: 16 },

  fieldLabel: { fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm },
  inputWrap: {
    borderWidth: 1.5, borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md, height: 52,
    justifyContent: 'center',
  },
  input: { fontSize: FONT_SIZE.md },

  // Suggestions
  suggestionsSection: { marginTop: SPACING.lg },
  suggestionsLabel: { fontSize: FONT_SIZE.xs, fontWeight: '600', marginBottom: SPACING.sm },
  suggestionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1,
  },
  chipText: { fontSize: FONT_SIZE.sm },

  // Currency
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  currChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1.5,
  },
  currChipText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },

  // Bottom bar
  bottomBar: { padding: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: 16, borderRadius: BORDER_RADIUS.sm,
  },
  addBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
})