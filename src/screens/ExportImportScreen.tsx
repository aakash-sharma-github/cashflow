// src/screens/ExportImportScreen.tsx
import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { exportEntriesAsCSV, exportEntriesAsPDF, pickAndParseCSV, ImportResult } from '../services/exportService'
import { entriesService } from '../services/entriesService'
import { useEntriesStore } from '../store/entriesStore'
import { useBooksStore } from '../store/booksStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { formatAmount } from '../utils'

export default function ExportImportScreen({ route }: any) {
  const { bookId } = route.params
  const { currentBook } = useBooksStore()
  const { entries } = useEntriesStore()
  const { mode } = useThemeStore()
  const theme = getTheme(mode)

  const [csvLoading, setCsvLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)

  if (!currentBook) return null

  const handleExportCSV = async () => {
    setCsvLoading(true)
    try {
      const { data } = await entriesService.getEntries(bookId, 'all', 0)
      await exportEntriesAsCSV(data || entries, currentBook)
    } catch (e: any) { Alert.alert('Export Failed', e.message) }
    finally { setCsvLoading(false) }
  }

  const handleExportPDF = async () => {
    setPdfLoading(true)
    try {
      const { data } = await entriesService.getEntries(bookId, 'all', 0)
      await exportEntriesAsPDF(data || entries, currentBook)
    } catch (e: any) { Alert.alert('Export Failed', e.message) }
    finally { setPdfLoading(false) }
  }

  const handlePickCSV = async () => {
    setImportLoading(true)
    try {
      const result = await pickAndParseCSV()
      if (result) setImportPreview(result)
    } catch (e: any) { Alert.alert('Could not read file', e.message) }
    finally { setImportLoading(false) }
  }

  const handleConfirmImport = async () => {
    if (!importPreview?.rows.length) return
    Alert.alert(
      `Import ${importPreview.rows.length} entries?`,
      `Add to "${currentBook.name}". This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import', onPress: async () => {
            setImporting(true)
            let ok = 0, fail = 0
            for (const r of importPreview.rows) {
              const { error } = await entriesService.createEntry(bookId, {
                amount: String(r.amount), type: r.type,
                note: r.note || '', entry_date: new Date(r.entry_date),
              })
              if (error) fail++; else ok++
            }
            setImporting(false)
            setImportPreview(null)
            useEntriesStore.getState().fetchEntries(bookId)
            Alert.alert('Done ✅', `${ok} imported${fail > 0 ? `, ${fail} failed` : ''}.`)
          }
        },
      ]
    )
  }

  interface ActionCardProps {
    icon: string; iconBg: string; iconColor: string
    title: string; desc: string; onPress: () => void; loading: boolean
  }
  const ActionCard = ({ icon, iconBg, iconColor, title, desc, onPress, loading: cardLoading }: ActionCardProps) => (
    <TouchableOpacity
      style={[s.actionCard, { backgroundColor: theme.surface }]}
      onPress={onPress}
      disabled={cardLoading}
      activeOpacity={0.82}
    >
      <View style={[s.actionIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={22} color={iconColor} />
      </View>
      <View style={s.actionText}>
        <Text style={[s.actionTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[s.actionDesc, { color: theme.textSecondary }]}>{desc}</Text>
      </View>
      {cardLoading
        ? <ActivityIndicator color={COLORS.primary} size="small" />
        : <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
      }
    </TouchableOpacity>
  )

  const cashIn = importPreview?.rows.filter(r => r.type === 'cash_in').reduce((s, r) => s + r.amount, 0) || 0
  const cashOut = importPreview?.rows.filter(r => r.type === 'cash_out').reduce((s, r) => s + r.amount, 0) || 0

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Export */}
        <View style={s.sectionHeader}>
          <LinearGradient colors={[COLORS.cashInLight, theme.background]} style={s.sectionIconWrap}>
            <Ionicons name="share-outline" size={18} color={COLORS.cashIn} />
          </LinearGradient>
          <View>
            <Text style={[s.sectionTitle, { color: theme.text }]}>Export</Text>
            <Text style={[s.sectionSub, { color: theme.textSecondary }]}>Download entries from this book</Text>
          </View>
        </View>

        <ActionCard
          icon="grid-outline" iconBg={COLORS.cashInLight} iconColor={COLORS.cashIn}
          title="Export as CSV" desc="Open in Excel, Google Sheets, or Numbers"
          onPress={handleExportCSV} loading={csvLoading}
        />
        <ActionCard
          icon="document-text-outline" iconBg={COLORS.cashOutLight} iconColor={COLORS.cashOut}
          title="Export as PDF" desc="Formatted report with summary table"
          onPress={handleExportPDF} loading={pdfLoading}
        />

        <View style={[s.divider, { backgroundColor: theme.border }]} />

        {/* Import */}
        <View style={s.sectionHeader}>
          <LinearGradient colors={[COLORS.primaryLight, theme.background]} style={s.sectionIconWrap}>
            <Ionicons name="cloud-upload-outline" size={18} color={COLORS.primary} />
          </LinearGradient>
          <View>
            <Text style={[s.sectionTitle, { color: theme.text }]}>Import</Text>
            <Text style={[s.sectionSub, { color: theme.textSecondary }]}>Add entries from a CSV file</Text>
          </View>
        </View>

        {/* Format hint */}
        <View style={s.codeCard}>
          <View style={s.codeHeader}>
            <Ionicons name="code-slash-outline" size={14} color="#94a3b8" />
            <Text style={s.codeHeaderText}>Expected CSV format</Text>
          </View>
          <Text style={s.codeLine}>Date,Type,Amount,Note</Text>
          <Text style={s.codeLine}>2024-01-15,Cash In,500.00,Salary</Text>
          <Text style={s.codeLine}>2024-01-16,Cash Out,120.00,Groceries</Text>
          <Text style={s.codeNote}>Type accepts: "Cash In" / "in" / "Cash Out" / "out"</Text>
        </View>

        <ActionCard
          icon="folder-open-outline" iconBg={COLORS.primaryLight} iconColor={COLORS.primary}
          title="Choose CSV File" desc="Pick a .csv file from your device"
          onPress={handlePickCSV} loading={importLoading}
        />

        {/* Import preview */}
        {importPreview && (
          <View style={[s.previewCard, { backgroundColor: theme.surface, borderColor: COLORS.primary }]}>
            <View style={s.previewHeader}>
              <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
              <Text style={[s.previewTitle, { color: theme.text }]}>Preview</Text>
            </View>

            <View style={[s.previewStats, { backgroundColor: theme.background }]}>
              <View style={s.previewStat}>
                <Text style={[s.previewStatNum, { color: theme.text }]}>{importPreview.rows.length}</Text>
                <Text style={[s.previewStatLabel, { color: theme.textTertiary }]}>entries</Text>
              </View>
              <View style={[s.previewStatDiv, { backgroundColor: theme.border }]} />
              <View style={s.previewStat}>
                <Text style={[s.previewStatNum, { color: COLORS.cashIn }]}>+{formatAmount(cashIn, currentBook.currency)}</Text>
                <Text style={[s.previewStatLabel, { color: theme.textTertiary }]}>cash in</Text>
              </View>
              <View style={[s.previewStatDiv, { backgroundColor: theme.border }]} />
              <View style={s.previewStat}>
                <Text style={[s.previewStatNum, { color: COLORS.cashOut }]}>-{formatAmount(cashOut, currentBook.currency)}</Text>
                <Text style={[s.previewStatLabel, { color: theme.textTertiary }]}>cash out</Text>
              </View>
            </View>

            {importPreview.skipped > 0 && (
              <View style={s.warnRow}>
                <Ionicons name="warning-outline" size={14} color="#92400e" />
                <Text style={s.warnText}> {importPreview.skipped} rows skipped</Text>
              </View>
            )}

            {importPreview.rows.length > 0 ? (
              <View style={s.previewActions}>
                <TouchableOpacity
                  style={[s.previewCancelBtn, { borderColor: theme.border }]}
                  onPress={() => setImportPreview(null)}
                >
                  <Text style={[s.previewCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.previewConfirmBtn, importing && { opacity: 0.6 }]}
                  onPress={handleConfirmImport}
                  disabled={importing}
                >
                  <LinearGradient colors={['#5B5FED', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.previewConfirmGrad}>
                    {importing
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Ionicons name="cloud-upload-outline" size={16} color="#fff" /><Text style={s.previewConfirmText}>Import {importPreview.rows.length}</Text></>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[s.noRowsText, { color: theme.textSecondary }]}>No valid rows found in this file.</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: SPACING.lg, paddingBottom: 60 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  sectionIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800' },
  sectionSub: { fontSize: FONT_SIZE.xs },

  actionCard: { flexDirection: 'row', alignItems: 'center', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOW.sm },
  actionIconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  actionText: { flex: 1 },
  actionTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: 2 },
  actionDesc: { fontSize: FONT_SIZE.xs },

  divider: { height: 1, marginVertical: SPACING.xl },

  codeCard: { backgroundColor: '#0F172A', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  codeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  codeHeaderText: { fontSize: FONT_SIZE.xs, color: '#94a3b8', fontWeight: '600' },
  codeLine: { fontSize: 12, color: '#86efac', fontFamily: 'monospace', lineHeight: 20 },
  codeNote: { fontSize: FONT_SIZE.xs, color: '#64748b', marginTop: SPACING.sm },

  previewCard: { borderRadius: BORDER_RADIUS.lg, padding: SPACING.lg, marginTop: SPACING.md, borderWidth: 2, ...SHADOW.sm },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.md },
  previewTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700' },
  previewStats: { flexDirection: 'row', alignItems: 'center', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  previewStat: { flex: 1, alignItems: 'center' },
  previewStatNum: { fontSize: FONT_SIZE.lg, fontWeight: '800' },
  previewStatLabel: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  previewStatDiv: { width: 1, height: 30 },
  warnRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 8, padding: SPACING.sm, marginBottom: SPACING.sm },
  warnText: { fontSize: FONT_SIZE.xs, color: '#92400e' },
  previewActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  previewCancelBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: BORDER_RADIUS.md, borderWidth: 1.5 },
  previewCancelText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  previewConfirmBtn: { flex: 2, borderRadius: BORDER_RADIUS.md, overflow: 'hidden' },
  previewConfirmGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, gap: 6 },
  previewConfirmText: { fontSize: FONT_SIZE.sm, color: '#fff', fontWeight: '700' },
  noRowsText: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: SPACING.md },
})