// src/screens/AddEditEntryScreen.tsx
import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Modal, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useEntriesStore } from '../store/entriesStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { isValidAmount } from '../utils'
import { format, isToday, isYesterday } from 'date-fns'
import type { EntryType } from '../types'

function formatPickerDate(date: Date): string {
  if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`
  return format(date, 'MMM d, yyyy  h:mm a')
}

export default function AddEditEntryScreen({ route, navigation }: any) {
  const { bookId, entry, currency = 'USD' } = route.params
  const isEditing = !!entry

  const [amount, setAmount] = useState(isEditing ? String(entry.amount) : '')
  const [type, setType] = useState<EntryType>(isEditing ? entry.type : 'cash_in')
  const [note, setNote] = useState(isEditing ? (entry.note || '') : '')
  const [entryDate, setEntryDate] = useState<Date>(isEditing ? new Date(entry.entry_date) : new Date())
  const [loading, setLoading] = useState(false)

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date')
  // On Android we show date then time sequentially; on iOS the spinner handles both
  const [tempDate, setTempDate] = useState<Date>(entryDate)

  const { createEntry, updateEntry } = useEntriesStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  const isCashIn = type === 'cash_in'
  const accentColor = isCashIn ? COLORS.cashIn : COLORS.cashOut

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
    if (error) { Alert.alert('Error', error); return }
    navigation.goBack()
  }

  // ── Date picker logic ────────────────────────────────────
  const openDatePicker = () => {
    setTempDate(entryDate)
    setPickerMode('date')
    setShowDatePicker(true)
  }

  const handleDateChange = (_: any, selected?: Date) => {
    if (!selected) {
      // User cancelled on Android
      setShowDatePicker(false)
      return
    }
    if (Platform.OS === 'android') {
      if (pickerMode === 'date') {
        // Merge selected date with existing time
        const merged = new Date(selected)
        merged.setHours(tempDate.getHours(), tempDate.getMinutes())
        setTempDate(merged)
        // Now show time picker
        setPickerMode('time')
      } else {
        // Merge selected time with previously chosen date
        const merged = new Date(tempDate)
        merged.setHours(selected.getHours(), selected.getMinutes())
        setEntryDate(merged)
        setShowDatePicker(false)
      }
    } else {
      // iOS — spinner updates continuously
      setTempDate(selected)
    }
  }

  const handleIOSConfirm = () => {
    setEntryDate(tempDate)
    setShowDatePicker(false)
  }

  const handleIOSCancel = () => {
    setShowDatePicker(false)
  }

  const currencySymbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹', NPR: 'रू', AED: 'د.إ', SAR: '﷼', BDT: '৳',
  }
  const symbol = currencySymbols[currency] || currency

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Type toggle ─────────────────────────────── */}
          <View style={s.typeRow}>
            {(['cash_in', 'cash_out'] as EntryType[]).map(t => {
              const active = type === t
              const col = t === 'cash_in' ? COLORS.cashIn : COLORS.cashOut
              const lightCol = t === 'cash_in' ? COLORS.cashInLight : COLORS.cashOutLight
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    s.typeBtn,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                    active && { backgroundColor: lightCol, borderColor: col },
                  ]}
                  onPress={() => setType(t)}
                  activeOpacity={0.8}
                >
                  <View style={[s.typeBtnIcon, { backgroundColor: active ? col : theme.border }]}>
                    <Ionicons name={t === 'cash_in' ? 'arrow-down' : 'arrow-up'} size={16} color={active ? '#fff' : theme.textTertiary} />
                  </View>
                  <Text style={[s.typeBtnLabel, { color: active ? col : theme.textSecondary }]}>
                    {t === 'cash_in' ? 'Cash In' : 'Cash Out'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* ── Amount ──────────────────────────────────── */}
          <View style={[s.amountCard, { backgroundColor: theme.surface, borderColor: accentColor }]}>
            <Text style={[s.currencySymbol, { color: accentColor }]}>{symbol}</Text>
            <TextInput
              style={[s.amountInput, { color: accentColor }]}
              value={amount}
              onChangeText={v => { if (/^\d*\.?\d{0,2}$/.test(v)) setAmount(v) }}
              placeholder="0.00"
              placeholderTextColor={accentColor + '50'}
              keyboardType="decimal-pad"
              autoFocus={!isEditing}
            />
            {amount ? (
              <TouchableOpacity onPress={() => setAmount('')} style={s.clearBtn}>
                <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* ── Note ────────────────────────────────────── */}
          <View style={s.field}>
            <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Note (optional)</Text>
            <TextInput
              style={[s.noteInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              value={note}
              onChangeText={setNote}
              placeholder="What was this for?"
              placeholderTextColor={theme.textTertiary}
              multiline
              maxLength={200}
            />
          </View>

          {/* ── Date & Time ─────────────────────────────── */}
          <View style={s.field}>
            <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Date & Time</Text>
            <TouchableOpacity
              style={[s.dateRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={openDatePicker}
              activeOpacity={0.8}
            >
              <View style={[s.dateIconWrap, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="calendar" size={16} color={COLORS.primary} />
              </View>
              <Text style={[s.dateText, { color: theme.text }]}>{formatPickerDate(entryDate)}</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
            </TouchableOpacity>
          </View>

          {/* ── Save button ──────────────────────────────── */}
          <TouchableOpacity
            style={[s.saveBtn, { opacity: loading ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={isCashIn ? ['#00C48C', '#00A374'] : ['#FF647C', '#E84560']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={s.saveBtnGrad}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <>
                  <Ionicons name={isEditing ? 'checkmark' : 'add'} size={20} color="#fff" />
                  <Text style={s.saveBtnText}>
                    {isEditing ? 'Update Entry' : `Add ${isCashIn ? 'Cash In' : 'Cash Out'}`}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity style={s.cancelBtn} onPress={() => navigation.goBack()}>
              <Text style={[s.cancelText, { color: theme.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Date Picker ─────────────────────────────────── */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={tempDate}
          mode={pickerMode}
          display="default"
          onChange={handleDateChange}
          maximumDate={new Date()}
        />
      )}

      {/* iOS: modal spinner */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showDatePicker}
          transparent
          animationType="slide"
          onRequestClose={handleIOSCancel}
        >
          <Pressable style={s.modalBackdrop} onPress={handleIOSCancel} />
          <View style={[s.modalSheet, { backgroundColor: theme.surface }]}>
            <View style={[s.modalHeader, { borderBottomColor: theme.border }]}>
              <TouchableOpacity onPress={handleIOSCancel}>
                <Text style={[s.modalCancel, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[s.modalTitle, { color: theme.text }]}>Select Date & Time</Text>
              <TouchableOpacity onPress={handleIOSConfirm}>
                <Text style={s.modalDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="datetime"
              display="spinner"
              onChange={handleDateChange}
              maximumDate={new Date()}
              textColor={theme.text}
              style={{ height: 200 }}
            />
          </View>
        </Modal>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.xl },

  typeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: 14, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2, ...SHADOW.sm,
  },
  typeBtnIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeBtnLabel: { fontSize: FONT_SIZE.md, fontWeight: '700' },

  amountCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: BORDER_RADIUS.xl, borderWidth: 2,
    paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl, ...SHADOW.sm,
  },
  currencySymbol: { fontSize: FONT_SIZE['2xl'], fontWeight: '700', marginRight: SPACING.sm },
  amountInput: { flex: 1, fontSize: 42, fontWeight: '900', paddingVertical: SPACING.lg, letterSpacing: -1 },
  clearBtn: { padding: 4 },

  field: { marginBottom: SPACING.lg },
  fieldLabel: {
    fontSize: FONT_SIZE.xs, fontWeight: '700',
    marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  noteInput: {
    borderRadius: BORDER_RADIUS.md, borderWidth: 1.5,
    padding: SPACING.md, fontSize: FONT_SIZE.md,
    minHeight: 80, textAlignVertical: 'top',
  },

  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, padding: SPACING.md,
  },
  dateIconWrap: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dateText: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '500' },

  saveBtn: { borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', marginTop: SPACING.sm, ...SHADOW.md },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: SPACING.sm },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },

  cancelBtn: { paddingVertical: SPACING.md, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.md, fontWeight: '600' },

  // iOS date picker modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 32, ...SHADOW.lg,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: FONT_SIZE.md, fontWeight: '700' },
  modalCancel: { fontSize: FONT_SIZE.md },
  modalDone: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.primary },
})