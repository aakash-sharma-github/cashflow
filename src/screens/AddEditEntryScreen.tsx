// src/screens/AddEditEntryScreen.tsx — Redesigned: CashBook-style
// Date + Time pickers top row, Cash In/Out badge selector,
// amount field color-coded green/red, remark field, SAVE & ADD NEW + SAVE
import React, { useState, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator, ScrollView, Modal, Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useEntriesStore } from '../store/entriesStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE } from '../constants'
import { isValidAmount } from '../utils'
import { format, isToday, isYesterday } from 'date-fns'
import type { EntryType } from '../types'

type AndroidStage = 'idle' | 'date' | 'time'

export default function AddEditEntryScreen({ route, navigation }: any) {
  const { bookId, entry, currency = 'USD' } = route.params
  const isEditing = !!entry

  const [type, setType] = useState<EntryType>(isEditing ? entry.type : 'cash_in')
  const [amount, setAmount] = useState(isEditing ? String(entry.amount) : '')
  const [note, setNote] = useState(isEditing ? (entry.note || '') : '')
  const [entryDate, setEntryDate] = useState<Date>(
    isEditing ? new Date(entry.entry_date) : new Date()
  )
  const [loading, setLoading] = useState(false)
  const [loadingNew, setLoadingNew] = useState(false)

  // iOS picker
  const [iosVisible, setIosVisible] = useState(false)
  const [iosTempDate, setIosTempDate] = useState<Date>(entryDate)
  const [iosPickerTarget, setIosPickerTarget] = useState<'date' | 'time'>('date')

  // Android picker
  const androidStage = useRef<AndroidStage>('idle')
  const androidTempDate = useRef<Date>(new Date(entryDate))
  const [androidVisible, setAndroidVisible] = useState(false)
  const [androidMode, setAndroidMode] = useState<'date' | 'time'>('date')
  const [androidKey, setAndroidKey] = useState(0)

  const { createEntry, updateEntry } = useEntriesStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  const isCashIn = type === 'cash_in'

  // Amount color: green for cash in, red for cash out
  const amountColor = isCashIn ? COLORS.cashIn : COLORS.cashOut
  const amountBorderColor = isCashIn ? COLORS.cashIn : COLORS.cashOut

  const currencySymbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹', NPR: 'रू', AED: 'د.إ', SAR: '﷼', BDT: '৳',
  }
  const symbol = currencySymbols[currency] || currency

  const doSave = async (addNew: boolean) => {
    if (!isValidAmount(amount)) return

    if (addNew) setLoadingNew(true)
    else setLoading(true)

    const formData = { amount, type, note, entry_date: entryDate }
    const { error } = isEditing
      ? await updateEntry(entry.id, formData, bookId)
      : await createEntry(bookId, formData)

    setLoading(false)
    setLoadingNew(false)

    if (error) return

    if (addNew) {
      // Reset form for new entry
      setAmount('')
      setNote('')
      setEntryDate(new Date())
    } else {
      navigation.goBack()
    }
  }

  // ── Android picker ───────────────────────────────────────────
  const openAndroid = useCallback((startMode: 'date' | 'time') => {
    androidStage.current = startMode
    androidTempDate.current = new Date(entryDate)
    setAndroidMode(startMode)
    setAndroidKey(k => k + 1)
    setAndroidVisible(true)
  }, [entryDate])

  const handleAndroidChange = useCallback((_: any, selected?: Date) => {
    if (!selected) { setAndroidVisible(false); androidStage.current = 'idle'; return }
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

  // ── iOS picker ───────────────────────────────────────────────
  const openIos = (target: 'date' | 'time') => {
    setIosTempDate(entryDate)
    setIosPickerTarget(target)
    setIosVisible(true)
  }

  const dateLabel = isToday(entryDate)
    ? 'Today'
    : isYesterday(entryDate)
      ? 'Yesterday'
      : format(entryDate, 'dd/MM/yyyy')

  const timeLabel = format(entryDate, 'hh:mm a')

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={[s.scroll, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Header: title from navigation */}
        <Text style={[s.screenTitle, { color: theme.text }]}>
          {isEditing ? 'Edit Entry' : (isCashIn ? 'Add Cash In Entry' : 'Add Cash Out Entry')}
        </Text>

        {/* ── Date + Time row ────────────────────────────── */}
        <View style={s.dateTimeRow}>
          <TouchableOpacity
            style={[s.dateTimePicker, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => Platform.OS === 'ios' ? openIos('date') : openAndroid('date')}
            activeOpacity={0.8}
          >
            <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
            <View>
              <Text style={[s.dateTimeLabel, { color: theme.textTertiary }]}>Date</Text>
              <Text style={[s.dateTimeVal, { color: theme.text }]}>{dateLabel}</Text>
            </View>
            <Ionicons name="chevron-down" size={14} color={theme.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.dateTimePicker, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={() => Platform.OS === 'ios' ? openIos('time') : openAndroid('time')}
            activeOpacity={0.8}
          >
            <Ionicons name="time-outline" size={18} color={COLORS.primary} />
            <View>
              <Text style={[s.dateTimeLabel, { color: theme.textTertiary }]}>Time</Text>
              <Text style={[s.dateTimeVal, { color: theme.text }]}>{timeLabel}</Text>
            </View>
            <Ionicons name="chevron-down" size={14} color={theme.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* ── Amount field ───────────────────────────────── */}
        <View style={[s.amountWrap, { borderColor: amountBorderColor, backgroundColor: theme.surface }]}>
          <Text style={[s.amountFieldLabel, { color: theme.textSecondary }]}>
            Amount <Text style={{ color: COLORS.cashOut }}>*</Text>
          </Text>
          <View style={s.amountRow}>
            <Text style={[s.currencyPrefix, { color: amountColor }]}>{symbol} </Text>
            <TextInput
              style={[s.amountInput, { color: amountColor }]}
              value={amount}
              onChangeText={v => { if (/^\d*\.?\d{0,2}$/.test(v)) setAmount(v) }}
              placeholder="0"
              placeholderTextColor={amountColor + '50'}
              keyboardType="decimal-pad"
              autoFocus={!isEditing}
            />
          </View>
        </View>

        {/* ── Cash In / Cash Out badge selector ─────────── */}
        <View style={s.typeRow}>
          <TouchableOpacity
            style={[
              s.typeBadge,
              { borderColor: theme.border, backgroundColor: theme.surface },
              isCashIn && { borderColor: COLORS.cashIn, backgroundColor: '#1a2e1a' },
            ]}
            onPress={() => setType('cash_in')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={14} color={isCashIn ? COLORS.cashIn : theme.textTertiary} />
            <Text style={[s.typeBadgeText, { color: isCashIn ? COLORS.cashIn : theme.textTertiary }]}>
              CASH IN
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.typeBadge,
              { borderColor: theme.border, backgroundColor: theme.surface },
              !isCashIn && { borderColor: COLORS.cashOut, backgroundColor: '#2e1a1a' },
            ]}
            onPress={() => setType('cash_out')}
            activeOpacity={0.8}
          >
            <Ionicons name="remove" size={14} color={!isCashIn ? COLORS.cashOut : theme.textTertiary} />
            <Text style={[s.typeBadgeText, { color: !isCashIn ? COLORS.cashOut : theme.textTertiary }]}>
              CASH OUT
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Remark field ───────────────────────────────── */}
        <View style={[s.inputWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TextInput
            style={[s.remarkInput, { color: theme.text }]}
            value={note}
            onChangeText={setNote}
            placeholder="Remark"
            placeholderTextColor={theme.textTertiary}
            multiline
            maxLength={200}
          />
          <Ionicons name="mic-outline" size={20} color={theme.textTertiary} style={s.micIcon} />
        </View>

      </ScrollView>

      {/* ── Bottom buttons ─────────────────────────────── */}
      <View style={[s.bottomBar, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
        {!isEditing && (
          <TouchableOpacity
            style={[s.saveNewBtn, { borderColor: isCashIn ? COLORS.cashIn : COLORS.cashOut }]}
            onPress={() => doSave(true)}
            disabled={loadingNew || !amount}
            activeOpacity={0.85}
          >
            {loadingNew
              ? <ActivityIndicator color={isCashIn ? COLORS.cashIn : COLORS.cashOut} size="small" />
              : <Text style={[s.saveNewText, { color: isCashIn ? COLORS.cashIn : COLORS.cashOut }]}>
                SAVE &amp; ADD NEW
              </Text>
            }
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            s.saveBtn,
            { backgroundColor: isCashIn ? COLORS.cashIn : COLORS.cashOut },
            (!amount) && { opacity: 0.5 },
          ]}
          onPress={() => doSave(false)}
          disabled={loading || !amount}
          activeOpacity={0.88}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.saveBtnText}>{isEditing ? 'UPDATE' : 'SAVE'}</Text>
          }
        </TouchableOpacity>
      </View>

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

      {/* iOS modal picker */}
      {Platform.OS === 'ios' && (
        <Modal visible={iosVisible} transparent animationType="slide" onRequestClose={() => setIosVisible(false)}>
          <Pressable style={s.backdrop} onPress={() => setIosVisible(false)} />
          <View style={[s.sheet, { backgroundColor: theme.surface }]}>
            <View style={[s.sheetHeader, { borderBottomColor: theme.border }]}>
              <TouchableOpacity onPress={() => setIosVisible(false)}>
                <Text style={[s.sheetCancel, { color: theme.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[s.sheetTitle, { color: theme.text }]}>
                {iosPickerTarget === 'date' ? 'Select Date' : 'Select Time'}
              </Text>
              <TouchableOpacity onPress={() => { setEntryDate(iosTempDate); setIosVisible(false) }}>
                <Text style={[s.sheetDone, { color: COLORS.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={iosTempDate}
              mode={iosPickerTarget}
              display="spinner"
              onChange={(_, d) => { if (d) setIosTempDate(d) }}
              maximumDate={iosPickerTarget === 'date' ? new Date() : undefined}
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
  scroll: { padding: SPACING.lg, paddingBottom: 16 },

  screenTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', marginBottom: SPACING.lg },

  // Date + Time row
  dateTimeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  dateTimePicker: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1,
    padding: SPACING.sm,
  },
  dateTimeLabel: { fontSize: 10, fontWeight: '600' },
  dateTimeVal: { fontSize: FONT_SIZE.sm, fontWeight: '600' },

  // Amount
  amountWrap: {
    borderWidth: 1.5, borderRadius: BORDER_RADIUS.sm,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  amountFieldLabel: { fontSize: FONT_SIZE.xs, marginBottom: SPACING.sm },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  currencyPrefix: { fontSize: 28, fontWeight: '700' },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '700', padding: 0 },

  // Type badge selector
  typeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  typeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1.5,
  },
  typeBadgeText: { fontSize: FONT_SIZE.xs, fontWeight: '700', letterSpacing: 0.5 },

  // Remark
  inputWrap: {
    borderWidth: 1, borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: SPACING.md, minHeight: 56,
  },
  remarkInput: { flex: 1, fontSize: FONT_SIZE.md, paddingTop: 4 },
  micIcon: { marginTop: 4 },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row', gap: SPACING.sm,
    padding: SPACING.md, borderTopWidth: 1,
  },
  saveNewBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1.5,
  },
  saveNewText: { fontSize: FONT_SIZE.sm, fontWeight: '700', letterSpacing: 0.5 },
  saveBtn: {
    flex: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    borderRadius: BORDER_RADIUS.sm,
  },
  saveBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  // iOS picker
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 32 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: FONT_SIZE.md, fontWeight: '700' },
  sheetCancel: { fontSize: FONT_SIZE.md },
  sheetDone: { fontSize: FONT_SIZE.md, fontWeight: '700' },
})