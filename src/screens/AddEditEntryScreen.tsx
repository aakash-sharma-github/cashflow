// src/screens/AddEditEntryScreen.tsx
// Key fixes:
// 1. Removed KeyboardAvoidingView — on Android with gestureEnabled:false it
//    caused the view to shrink/disappear when keyboard appeared.
//    Using ScrollView with keyboardShouldPersistTaps + bottom padding instead.
// 2. Android date picker uses refs to avoid re-render during mode switch.
// 3. Android picker key prop forces clean remount when switching date→time.

import React, { useState, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, Alert, ScrollView, Modal, Pressable,
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
  return format(date, 'MMM d, yyyy  ·  h:mm a')
}

type AndroidStage = 'idle' | 'date' | 'time'

export default function AddEditEntryScreen({ route, navigation }: any) {
  const { bookId, entry, currency = 'USD' } = route.params
  const isEditing = !!entry

  const [amount, setAmount] = useState(isEditing ? String(entry.amount) : '')
  const [type, setType] = useState<EntryType>(isEditing ? entry.type : 'cash_in')
  const [note, setNote] = useState(isEditing ? (entry.note || '') : '')
  const [entryDate, setEntryDate] = useState<Date>(
    isEditing ? new Date(entry.entry_date) : new Date()
  )
  const [loading, setLoading] = useState(false)

  // iOS picker
  const [iosVisible, setIosVisible] = useState(false)
  const [iosTempDate, setIosTempDate] = useState<Date>(entryDate)

  // Android picker — use refs to prevent re-render during stage transition
  const androidStage = useRef<AndroidStage>('idle')
  const androidTempDate = useRef<Date>(new Date(entryDate))
  const [androidVisible, setAndroidVisible] = useState(false)
  const [androidMode, setAndroidMode] = useState<'date' | 'time'>('date')
  const [androidKey, setAndroidKey] = useState(0)

  const { createEntry, updateEntry } = useEntriesStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  const isCashIn = type === 'cash_in'
  const accent = isCashIn ? COLORS.cashIn : COLORS.cashOut

  const currencySymbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹', NPR: 'रू', AED: 'د.إ', SAR: '﷼', BDT: '৳',
  }
  const symbol = currencySymbols[currency] || currency

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

  const openPicker = useCallback(() => {
    if (Platform.OS === 'ios') {
      setIosTempDate(entryDate)
      setIosVisible(true)
    } else {
      androidStage.current = 'date'
      androidTempDate.current = new Date(entryDate)
      setAndroidMode('date')
      setAndroidKey(k => k + 1)
      setAndroidVisible(true)
    }
  }, [entryDate])

  const handleAndroidChange = useCallback((_: any, selected?: Date) => {
    if (!selected) {
      setAndroidVisible(false)
      androidStage.current = 'idle'
      return
    }
    if (androidStage.current === 'date') {
      const d = new Date(androidTempDate.current)
      d.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate())
      androidTempDate.current = d
      androidStage.current = 'time'
      setAndroidMode('time')
      setAndroidKey(k => k + 1)
    } else {
      const d = new Date(androidTempDate.current)
      d.setHours(selected.getHours(), selected.getMinutes(), 0, 0)
      setEntryDate(new Date(d))
      setAndroidVisible(false)
      androidStage.current = 'idle'
    }
  }, [])

  const handleIosChange = useCallback((_: any, d?: Date) => {
    if (d) setIosTempDate(d)
  }, [])

  const confirmIos = useCallback(() => {
    setEntryDate(iosTempDate)
    setIosVisible(false)
  }, [iosTempDate])

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      {/*
        CRITICAL: No KeyboardAvoidingView here.
        On Android with gestureEnabled:false + presentation:card, KAV with
        behavior="height" can collapse the entire view when keyboard opens.
        Instead we use ScrollView with generous paddingBottom so content
        is always reachable, and keyboardShouldPersistTaps="handled" so
        buttons work without dismissing keyboard first.
      */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scroll, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Type toggle ─────────────────────── */}
        <View style={s.typeRow}>
          {(['cash_in', 'cash_out'] as EntryType[]).map(t => {
            const active = type === t
            const col = t === 'cash_in' ? COLORS.cashIn : COLORS.cashOut
            const lite = t === 'cash_in' ? COLORS.cashInLight : COLORS.cashOutLight
            return (
              <TouchableOpacity
                key={t}
                style={[s.typeBtn, { backgroundColor: theme.surface, borderColor: theme.border },
                active && { backgroundColor: lite, borderColor: col }]}
                onPress={() => setType(t)}
                activeOpacity={0.8}
              >
                <View style={[s.typeIcon, { backgroundColor: active ? col : theme.border }]}>
                  <Ionicons
                    name={t === 'cash_in' ? 'arrow-down' : 'arrow-up'}
                    size={16}
                    color={active ? '#fff' : theme.textTertiary}
                  />
                </View>
                <Text style={[s.typeLabel, { color: active ? col : theme.textSecondary }]}>
                  {t === 'cash_in' ? 'Cash In' : 'Cash Out'}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* ── Amount ──────────────────────────── */}
        <View style={[s.amountCard, { backgroundColor: theme.surface, borderColor: accent }]}>
          <Text style={[s.currSym, { color: accent }]}>{symbol}</Text>
          <TextInput
            style={[s.amountInput, { color: accent }]}
            value={amount}
            onChangeText={v => { if (/^\d*\.?\d{0,2}$/.test(v)) setAmount(v) }}
            placeholder="0.00"
            placeholderTextColor={accent + '50'}
            keyboardType="decimal-pad"
            autoFocus={!isEditing}
          />
          {amount ? (
            <TouchableOpacity onPress={() => setAmount('')} style={s.clearBtn}>
              <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Note ────────────────────────────── */}
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

        {/* ── Date & Time ─────────────────────── */}
        <View style={s.field}>
          <Text style={[s.fieldLabel, { color: theme.textSecondary }]}>Date & Time</Text>
          <TouchableOpacity
            style={[s.dateRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={openPicker}
            activeOpacity={0.8}
          >
            <View style={[s.dateIcon, { backgroundColor: COLORS.primaryLight }]}>
              <Ionicons name="calendar" size={16} color={COLORS.primary} />
            </View>
            <Text style={[s.dateText, { color: theme.text }]}>{formatPickerDate(entryDate)}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* ── Save ────────────────────────────── */}
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

      {/* Android date/time picker */}
      {Platform.OS === 'android' && androidVisible && (
        <DateTimePicker
          key={`picker-${androidKey}`}
          value={androidTempDate.current}
          mode={androidMode}
          display="default"
          onChange={handleAndroidChange}
          maximumDate={androidMode === 'date' ? new Date() : undefined}
        />
      )}

      {/* iOS modal spinner */}
      {Platform.OS === 'ios' && (
        <Modal visible={iosVisible} transparent animationType="slide" onRequestClose={() => setIosVisible(false)}>
          <Pressable style={s.backdrop} onPress={() => setIosVisible(false)} />
          <View style={[s.sheet, { backgroundColor: theme.surface }]}>
            <View style={[s.sheetHeader, { borderBottomColor: theme.border }]}>
              <TouchableOpacity onPress={() => setIosVisible(false)}>
                <Text style={[s.sheetCancel, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[s.sheetTitle, { color: theme.text }]}>Date & Time</Text>
              <TouchableOpacity onPress={confirmIos}>
                <Text style={s.sheetDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={iosTempDate}
              mode="datetime"
              display="spinner"
              onChange={handleIosChange}
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
  safe: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },

  typeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xl },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: 14, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2, ...SHADOW.sm,
  },
  typeIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: FONT_SIZE.md, fontWeight: '700' },

  amountCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2, paddingHorizontal: SPACING.lg, marginBottom: SPACING.xl, ...SHADOW.sm,
  },
  currSym: { fontSize: FONT_SIZE['2xl'], fontWeight: '700', marginRight: SPACING.sm },
  amountInput: { flex: 1, fontSize: 42, fontWeight: '900', paddingVertical: SPACING.lg, letterSpacing: -1 },
  clearBtn: { padding: 4 },

  field: { marginBottom: SPACING.lg },
  fieldLabel: { fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.8 },
  noteInput: {
    borderRadius: BORDER_RADIUS.md, borderWidth: 1.5,
    padding: SPACING.md, fontSize: FONT_SIZE.md,
    minHeight: 80, textAlignVertical: 'top',
  },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, padding: SPACING.md },
  dateIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dateText: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: '500' },

  saveBtn: { borderRadius: BORDER_RADIUS.lg, overflow: 'hidden', marginTop: SPACING.sm, ...SHADOW.md },
  saveBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: SPACING.sm },
  saveBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: '#fff' },
  cancelBtn: { paddingVertical: SPACING.md, alignItems: 'center' },
  cancelText: { fontSize: FONT_SIZE.md, fontWeight: '600' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32, ...SHADOW.lg },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: FONT_SIZE.md, fontWeight: '700' },
  sheetCancel: { fontSize: FONT_SIZE.md },
  sheetDone: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.primary },
})