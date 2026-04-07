// src/screens/AddEditEntryScreen.tsx
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useEntriesStore } from '../store/entriesStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { isValidAmount, formatDateForDisplay } from '../utils'
import type { EntryType } from '../types'

export default function AddEditEntryScreen({ route, navigation }: any) {
  const { bookId, entry, currency = 'USD' } = route.params
  const isEditing = !!entry

  const [amount, setAmount] = useState(isEditing ? String(entry.amount) : '')
  const [type, setType] = useState<EntryType>(isEditing ? entry.type : 'cash_in')
  const [note, setNote] = useState(isEditing ? (entry.note || '') : '')
  const [entryDate] = useState(isEditing ? new Date(entry.entry_date) : new Date())
  const [loading, setLoading] = useState(false)

  const { createEntry, updateEntry } = useEntriesStore()

  const handleSave = async () => {
    if (!isValidAmount(amount)) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.')
      return
    }

    setLoading(true)
    const formData = { amount, type, note, entry_date: entryDate }

    const { error } = isEditing
      ? await updateEntry(entry.id, formData, bookId)
      : await createEntry(bookId, formData)

    setLoading(false)

    if (error) {
      Alert.alert('Error', error)
      return
    }

    navigation.goBack()
  }

  const TypeButton = ({ value, label, icon }: { value: EntryType; label: string; icon: string }) => (
    <TouchableOpacity
      style={[
        styles.typeBtn,
        type === value && (value === 'cash_in' ? styles.typeBtnInActive : styles.typeBtnOutActive),
      ]}
      onPress={() => setType(value)}
      activeOpacity={0.8}
    >
      <Text style={styles.typeIcon}>{icon}</Text>
      <Text style={[
        styles.typeLabel,
        type === value && styles.typeLabelActive,
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Type Toggle */}
          <View style={styles.typeRow}>
            <TypeButton value="cash_in" label="Cash In" icon="↑" />
            <TypeButton value="cash_out" label="Cash Out" icon="↓" />
          </View>

          {/* Amount Input */}
          <View style={[
            styles.amountContainer,
            { borderColor: type === 'cash_in' ? COLORS.cashIn : COLORS.cashOut }
          ]}>
            <Text style={[
              styles.currencySymbol,
              { color: type === 'cash_in' ? COLORS.cashIn : COLORS.cashOut }
            ]}>
              {currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'INR' ? '₹' : currency}
            </Text>
            <TextInput
              style={[
                styles.amountInput,
                { color: type === 'cash_in' ? COLORS.cashIn : COLORS.cashOut }
              ]}
              value={amount}
              onChangeText={v => {
                // Allow only numbers and one decimal point
                if (/^\d*\.?\d{0,2}$/.test(v)) setAmount(v)
              }}
              placeholder="0.00"
              placeholderTextColor={COLORS.textTertiary}
              keyboardType="decimal-pad"
              autoFocus={!isEditing}
            />
          </View>

          {/* Note Input */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="What was this for?"
              placeholderTextColor={COLORS.textTertiary}
              multiline
              maxLength={200}
              returnKeyType="done"
            />
          </View>

          {/* Date */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Date</Text>
            <View style={styles.dateDisplay}>
              <Text style={styles.dateText}>📅 {formatDateForDisplay(entryDate)}</Text>
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: type === 'cash_in' ? COLORS.cashIn : COLORS.cashOut },
              loading && styles.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnText}>
                  {isEditing ? 'Update Entry' : `Add ${type === 'cash_in' ? 'Cash In' : 'Cash Out'}`}
                </Text>
            }
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.xl },

  typeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    ...SHADOW.sm,
  },
  typeBtnInActive: {
    backgroundColor: COLORS.cashInLight,
    borderColor: COLORS.cashIn,
  },
  typeBtnOutActive: {
    backgroundColor: COLORS.cashOutLight,
    borderColor: COLORS.cashOut,
  },
  typeIcon: { fontSize: 20, fontWeight: '800' },
  typeLabel: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.textSecondary },
  typeLabelActive: { color: COLORS.text },

  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
    ...SHADOW.sm,
  },
  currencySymbol: {
    fontSize: FONT_SIZE['2xl'],
    fontWeight: '700',
    marginRight: SPACING.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: 40,
    fontWeight: '800',
    paddingVertical: SPACING.lg,
    letterSpacing: -1,
  },

  field: { marginBottom: SPACING.lg },
  fieldLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noteInput: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  dateDisplay: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  dateText: { fontSize: FONT_SIZE.md, color: COLORS.text },

  saveBtn: {
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md + 2,
    alignItems: 'center',
    marginTop: SPACING.lg,
    ...SHADOW.md,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },

  cancelBtn: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  cancelBtnText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, fontWeight: '600' },
})
