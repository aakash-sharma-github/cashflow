// src/screens/AddEditEntryScreen.tsx — Redesigned v2
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useEntriesStore } from '../store/entriesStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { useThemeStore, getTheme } from '../store/themeStore'
import { isValidAmount, formatDateForDisplay } from '../utils'
import type { EntryType } from '../types'

export default function AddEditEntryScreen({ route, navigation }: any) {
  const { bookId, entry, currency = 'USD' } = route.params
  const isEditing = !!entry

  const [amount, setAmount] = useState(isEditing ? String(entry.amount) : '')
  const [type, setType] = useState<EntryType>(isEditing ? entry.type : 'cash_in')
  const [note, setNote] = useState(isEditing ? (entry.note || '') : '')
  const [loading, setLoading] = useState(false)
  const { createEntry, updateEntry } = useEntriesStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  const isCashIn = type === 'cash_in'
  const accentColor = isCashIn ? COLORS.cashIn : COLORS.cashOut
  const accentLight = isCashIn ? COLORS.cashInLight : COLORS.cashOutLight

  const handleSave = async () => {
    if (!isValidAmount(amount)) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.')
      return
    }
    setLoading(true)
    const formData = { amount, type, note, entry_date: new Date() }
    const { error } = isEditing
      ? await updateEntry(entry.id, formData, bookId)
      : await createEntry(bookId, formData)
    setLoading(false)
    if (error) { Alert.alert('Error', error); return }
    navigation.goBack()
  }

  const currencySymbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹', NPR: 'रू', AED: 'د.إ', SAR: '﷼', BDT: '৳',
  }
  const symbol = currencySymbols[currency] || currency

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Type toggle */}
          <View style={styles.typeRow}>
            {(['cash_in', 'cash_out'] as EntryType[]).map(t => {
              const active = type === t
              const col = t === 'cash_in' ? COLORS.cashIn : COLORS.cashOut
              const lightCol = t === 'cash_in' ? COLORS.cashInLight : COLORS.cashOutLight
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, active && { backgroundColor: lightCol, borderColor: col }]}
                  onPress={() => setType(t)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.typeBtnIcon, { backgroundColor: active ? col : COLORS.border }]}>
                    <Ionicons
                      name={t === 'cash_in' ? 'arrow-down' : 'arrow-up'}
                      size={16}
                      color={active ? '#fff' : COLORS.textSecondary}
                    />
                  </View>
                  <Text style={[styles.typeBtnLabel, active && { color: col }]}>
                    {t === 'cash_in' ? 'Cash In' : 'Cash Out'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Amount input */}
          <View style={[styles.amountCard, { borderColor: accentColor }]}>
            <Text style={[styles.currencySymbol, { color: accentColor }]}>{symbol}</Text>
            <TextInput
              style={[styles.amountInput, { color: accentColor }]}
              value={amount}
              onChangeText={v => { if (/^\d*\.?\d{0,2}$/.test(v)) setAmount(v) }}
              placeholder="0.00"
              placeholderTextColor={accentColor + '50'}
              keyboardType="decimal-pad"
              autoFocus={!isEditing}
            />
            {amount ? (
              <TouchableOpacity onPress={() => setAmount('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={20} color={COLORS.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Note */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              <Ionicons name="create-outline" size={13} color={COLORS.textSecondary} />  Note (optional)
            </Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="What was this for?"
              placeholderTextColor={COLORS.textTertiary}
              multiline maxLength={200}
            />
          </View>

          {/* Date display */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>
              <Ionicons name="calendar-outline" size={13} color={COLORS.textSecondary} />  Date
            </Text>
            <View style={styles.dateRow}>
              <Ionicons name="today-outline" size={16} color={COLORS.primary} />
              <Text style={styles.dateText}>{formatDateForDisplay(new Date())}</Text>
            </View>
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[styles.saveBtn, { opacity: loading ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={isCashIn ? ['#00C48C', '#00A374'] : ['#FF647C', '#E84560']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.saveBtnGrad}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name={isEditing ? 'checkmark' : 'add'} size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>
                    {isEditing ? 'Update Entry' : `Add ${isCashIn ? 'Cash In' : 'Cash Out'}`}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xl },

  typeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: 14, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surface, borderWidth: 2, borderColor: COLORS.border,
    ...SHADOW.sm,
  },
  typeBtnIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeBtnLabel: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.textSecondary },

  amountCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2, paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl, ...SHADOW.sm,
  },
  currencySymbol: { fontSize: FONT_SIZE['2xl'], fontWeight: '700', marginRight: SPACING.sm },
  amountInput: { flex: 1, fontSize: 42, fontWeight: '900', paddingVertical: SPACING.lg, letterSpacing: -1 },
  clearBtn: { padding: 4 },

  field: { marginBottom: SPACING.lg },
  fieldLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.8 },
  noteInput: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border,
    padding: SPACING.md, fontSize: FONT_SIZE.md, color: COLORS.text,
    minHeight: 80, textAlignVertical: 'top',
  },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md,
  },
  dateText: { fontSize: FONT_SIZE.md, color: COLORS.text, fontWeight: '500' },

  saveBtn: { borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', marginTop: SPACING.sm, ...SHADOW.md },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: SPACING.sm },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },

  cancelBtn: { paddingVertical: SPACING.md, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.md, color: COLORS.textSecondary, fontWeight: '600' },
})