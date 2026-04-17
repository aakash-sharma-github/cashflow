// src/screens/ExportImportScreen.tsx
import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import {
  exportEntriesAsCSV, exportEntriesAsPDF,
  pickAndParseCSV, ImportResult,
} from '../services/exportService'
import { entriesService } from '../services/entriesService'
import { useEntriesStore } from '../store/entriesStore'
import { useBooksStore } from '../store/booksStore'
import { useThemeStore, getTheme } from '../store/themeStore'
import { themedAlert } from '../components/common/ThemedAlert'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { formatAmount } from '../utils'
import { format } from 'date-fns'

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

  // currentBook guard must come AFTER all hooks
  if (!currentBook) return null

  // ── Fetch all entries (bypasses pagination) ──────────────────
  const getAllEntries = async () => {
    // Use getAllEntries (no PAGE_SIZE limit) so export always gets all entries
    const { data } = await entriesService.getAllEntries(bookId, 'all')
    return data && data.length > 0 ? data : entries
  }

  const handleExportCSV = async () => {
    setCsvLoading(true)
    try {
      await exportEntriesAsCSV(await getAllEntries(), currentBook)
    } catch (e: any) { themedAlert('Export Failed', e.message) }
    finally { setCsvLoading(false) }
  }

  const handleExportPDF = async () => {
    setPdfLoading(true)
    try {
      await exportEntriesAsPDF(await getAllEntries(), currentBook)
    } catch (e: any) { themedAlert('Export Failed', e.message) }
    finally { setPdfLoading(false) }
  }

  const handlePickCSV = async () => {
    setImportLoading(true)
    try {
      const result = await pickAndParseCSV()
      if (result) {
        if (result.rows.length === 0 && result.skipped > 0) {
          themedAlert(
            'No Valid Entries',
            `All ${result.skipped} rows were skipped. Check the file format matches the expected layout below.`
          )
        } else {
          setImportPreview(result)
        }
      }
    } catch (e: any) { themedAlert('Could not read file', e.message) }
    finally { setImportLoading(false) }
  }

  const handleConfirmImport = async () => {
    if (!importPreview?.rows.length) return
    themedAlert(
      `Import ${importPreview.rows.length} entr${importPreview.rows.length === 1 ? 'y' : 'ies'}?`,
      `Add to "${currentBook.name}". This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import', onPress: async () => {
            setImporting(true)
            // Batch insert bypasses PAGE_SIZE — imports any number of entries
            const { inserted, failed } = await entriesService.batchCreateEntries(
              bookId,
              importPreview.rows.map(r => ({
                amount: r.amount,
                type: r.type,
                note: r.note || null,
                entry_date: r.entry_date,
              }))
            )
            setImporting(false)
            setImportPreview(null)
            useEntriesStore.getState().fetchEntries(bookId)
            themedAlert(
              'Import Complete ✅',
              `${inserted} entr${inserted === 1 ? 'y' : 'ies'} imported.${failed > 0 ? `\n${failed} failed.` : ''}`
            )
          },
        },
      ]
    )
  }

  interface CardProps {
    icon: string; iconBg: string; iconColor: string
    title: string; desc: string; onPress: () => void; loading: boolean
  }
  const ActionCard = ({ icon, iconBg, iconColor, title, desc, onPress, loading: cardLoad }: CardProps) => (
    <TouchableOpacity
      style={[s.actionCard, { backgroundColor: theme.surface }]}
      onPress={onPress}
      disabled={cardLoad}
      activeOpacity={0.82}
    >
      <View style={[s.actionIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={22} color={iconColor} />
      </View>
      <View style={s.actionText}>
        <Text style={[s.actionTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[s.actionDesc, { color: theme.textSecondary }]}>{desc}</Text>
      </View>
      {cardLoad
        ? <ActivityIndicator color={COLORS.primary} size="small" />
        : <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
      }
    </TouchableOpacity>
  )

  const previewCashIn = importPreview?.rows.filter(r => r.type === 'cash_in').reduce((s, r) => s + r.amount, 0) ?? 0
  const previewCashOut = importPreview?.rows.filter(r => r.type === 'cash_out').reduce((s, r) => s + r.amount, 0) ?? 0

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Export section ── */}
        <View style={s.sectionHead}>
          <View style={[s.sectionIconWrap, { backgroundColor: COLORS.cashInLight }]}>
            <Ionicons name="share-outline" size={18} color={COLORS.cashIn} />
          </View>
          <View>
            <Text style={[s.sectionTitle, { color: theme.text }]}>Export</Text>
            <Text style={[s.sectionSub, { color: theme.textSecondary }]}>Download entries from this book</Text>
          </View>
        </View>

        <ActionCard
          icon="grid-outline" iconBg={COLORS.cashInLight} iconColor={COLORS.cashIn}
          title="Export as CSV" desc="Compatible with CashBook, Excel, Google Sheets"
          onPress={handleExportCSV} loading={csvLoading}
        />
        <ActionCard
          icon="document-text-outline" iconBg={COLORS.cashOutLight} iconColor={COLORS.cashOut}
          title="Export as PDF" desc="Branded report with summary and transaction table"
          onPress={handleExportPDF} loading={pdfLoading}
        />

        <View style={[s.divider, { backgroundColor: theme.border }]} />

        {/* ── Import section ── */}
        <View style={s.sectionHead}>
          <View style={[s.sectionIconWrap, { backgroundColor: COLORS.primaryLight }]}>
            <Ionicons name="cloud-upload-outline" size={18} color={COLORS.primary} />
          </View>
          <View>
            <Text style={[s.sectionTitle, { color: theme.text }]}>Import</Text>
            <Text style={[s.sectionSub, { color: theme.textSecondary }]}>Add entries from a CSV file</Text>
          </View>
        </View>

        {/* Format guide */}
        <View style={s.codeCard}>
          <View style={s.codeRow}>
            <Ionicons name="code-slash-outline" size={13} color="#94a3b8" />
            <Text style={s.codeHeading}>Supported CSV formats</Text>
          </View>

          <Text style={s.codeSubLabel}>Format A — CashBook / this app's export:</Text>
          <Text style={s.codeLine}>Date,Time,Remark,Entry by,Cash In,Cash Out,Balance</Text>
          <Text style={s.codeLine}>13/Apr/2026,09:47 pm,Salary,Aakash,108000,,108000</Text>
          <Text style={s.codeLine}>25/Apr/2026,09:01 pm,Groceries,Aakash,,1700,106300</Text>

          <View style={[s.codeSep, { backgroundColor: '#1e293b' }]} />

          <Text style={s.codeSubLabel}>Format B — Simple:</Text>
          <Text style={s.codeLine}>Date,Time,Type,Amount,Note</Text>
          <Text style={s.codeLine}>13/Apr/2026,09:47 pm,Cash In,5000,Salary</Text>
          <Text style={s.codeLine}>25/Apr/2026,09:01 pm,Cash Out,1700,Groceries</Text>

          <Text style={s.codeNote}>Date: dd/MMM/yyyy · Time: hh:mm am/pm · Balance column ignored</Text>
        </View>

        <ActionCard
          icon="folder-open-outline" iconBg={COLORS.primaryLight} iconColor={COLORS.primary}
          title="Choose CSV File" desc="Pick a .csv file — Format A or B both work"
          onPress={handlePickCSV} loading={importLoading}
        />

        {/* ── Import preview ── */}
        {importPreview && (
          <View style={[s.previewCard, { backgroundColor: theme.surface, borderColor: COLORS.primary + '60' }]}>
            {/* Summary stats */}
            <View style={s.previewHeader}>
              <View style={[s.previewIconWrap, { backgroundColor: COLORS.primaryLight }]}>
                <Ionicons name="eye-outline" size={18} color={COLORS.primary} />
              </View>
              <Text style={[s.previewTitle, { color: theme.text }]}>Preview</Text>
              <TouchableOpacity onPress={() => setImportPreview(null)} style={s.previewClose}>
                <Ionicons name="close-circle" size={20} color={theme.textTertiary} />
              </TouchableOpacity>
            </View>

            <View style={[s.statsRow, { backgroundColor: theme.background }]}>
              <View style={s.statItem}>
                <Text style={[s.statNum, { color: theme.text }]}>{importPreview.rows.length}</Text>
                <Text style={[s.statLabel, { color: theme.textTertiary }]}>entries</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: theme.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statNum, { color: COLORS.cashIn }]}>
                  {formatAmount(previewCashIn, currentBook.currency)}
                </Text>
                <Text style={[s.statLabel, { color: theme.textTertiary }]}>cash in</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: theme.border }]} />
              <View style={s.statItem}>
                <Text style={[s.statNum, { color: COLORS.cashOut }]}>
                  {formatAmount(previewCashOut, currentBook.currency)}
                </Text>
                <Text style={[s.statLabel, { color: theme.textTertiary }]}>cash out</Text>
              </View>
            </View>

            {/* Skipped rows warning */}
            {importPreview.skipped > 0 && (
              <View style={s.warnRow}>
                <Ionicons name="warning-outline" size={13} color="#92400e" />
                <Text style={s.warnText}> {importPreview.skipped} row{importPreview.skipped > 1 ? 's' : ''} skipped (invalid or empty)</Text>
              </View>
            )}

            {/* Errors */}
            {importPreview.errors.length > 0 && (
              <View style={[s.errorBox, { backgroundColor: '#fef2f2' }]}>
                {importPreview.errors.slice(0, 3).map((e, i) => (
                  <Text key={i} style={s.errorText}>• {e}</Text>
                ))}
                {importPreview.errors.length > 3 && (
                  <Text style={s.errorText}>… and {importPreview.errors.length - 3} more</Text>
                )}
              </View>
            )}

            {/* Row preview list (first 5) */}
            {importPreview.rows.length > 0 && (
              <View style={s.rowPreviewList}>
                <Text style={[s.rowPreviewHeading, { color: theme.textSecondary }]}>
                  First {Math.min(5, importPreview.rows.length)} entries:
                </Text>
                {importPreview.rows.slice(0, 5).map((r, i) => (
                  <View key={i} style={[s.rowPreviewItem, { borderBottomColor: theme.border }]}>
                    <View style={[
                      s.rowPreviewDot,
                      { backgroundColor: r.type === 'cash_in' ? COLORS.cashInLight : COLORS.cashOutLight },
                    ]}>
                      <Ionicons
                        name={r.type === 'cash_in' ? 'arrow-down' : 'arrow-up'}
                        size={10}
                        color={r.type === 'cash_in' ? COLORS.cashIn : COLORS.cashOut}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowPreviewNote, { color: theme.text }]} numberOfLines={1}>
                        {r.note || (r.type === 'cash_in' ? 'Cash In' : 'Cash Out')}
                      </Text>
                      <Text style={[s.rowPreviewDate, { color: theme.textTertiary }]}>
                        {format(new Date(r.entry_date), 'dd MMM yyyy, h:mm a')}
                      </Text>
                    </View>
                    <Text style={[
                      s.rowPreviewAmt,
                      { color: r.type === 'cash_in' ? COLORS.cashIn : COLORS.cashOut },
                    ]}>
                      {formatAmount(r.amount, currentBook.currency)}
                    </Text>
                  </View>
                ))}
                {importPreview.rows.length > 5 && (
                  <Text style={[s.rowPreviewMore, { color: theme.textTertiary }]}>
                    + {importPreview.rows.length - 5} more entries
                  </Text>
                )}
              </View>
            )}

            {importPreview.rows.length > 0 ? (
              <View style={s.previewActions}>
                <TouchableOpacity
                  style={[s.cancelBtn, { borderColor: theme.border }]}
                  onPress={() => setImportPreview(null)}
                >
                  <Text style={[s.cancelBtnText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.confirmBtn, importing && { opacity: 0.6 }]}
                  onPress={handleConfirmImport}
                  disabled={importing}
                >
                  <LinearGradient
                    colors={['#5B5FED', '#7C3AED']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.confirmGrad}
                  >
                    {importing
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <>
                        <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
                        <Text style={s.confirmText}>Import {importPreview.rows.length}</Text>
                      </>
                    }
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[s.noRows, { color: theme.textSecondary }]}>
                No valid rows found. Check the file matches one of the formats above.
              </Text>
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

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  sectionIconWrap: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800' },
  sectionSub: { fontSize: FONT_SIZE.xs },

  actionCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
    marginBottom: SPACING.sm, ...SHADOW.sm,
  },
  actionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  actionText: { flex: 1 },
  actionTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', marginBottom: 2 },
  actionDesc: { fontSize: FONT_SIZE.xs },

  divider: { height: 1, marginVertical: SPACING.xl },

  codeCard: { backgroundColor: '#0F172A', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.sm },
  codeHeading: { fontSize: FONT_SIZE.xs, color: '#94a3b8', fontWeight: '700' },
  codeSubLabel: { fontSize: 11, color: '#64748b', fontWeight: '600', marginBottom: 4, marginTop: 2 },
  codeLine: { fontSize: 11, color: '#86efac', fontFamily: 'monospace', lineHeight: 19 },
  codeSep: { height: 1, marginVertical: SPACING.sm },
  codeNote: { fontSize: 10, color: '#475569', marginTop: SPACING.sm, lineHeight: 15 },

  previewCard: { borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginTop: SPACING.md, borderWidth: 1.5, ...SHADOW.sm },
  previewHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  previewIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.sm },
  previewTitle: { flex: 1, fontSize: FONT_SIZE.lg, fontWeight: '700' },
  previewClose: { padding: 4 },

  statsRow: { flexDirection: 'row', alignItems: 'center', borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: FONT_SIZE.md, fontWeight: '800' },
  statLabel: { fontSize: 10, marginTop: 2 },
  statDivider: { width: 1, height: 30 },

  warnRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 8, padding: SPACING.sm, marginBottom: SPACING.sm },
  warnText: { fontSize: FONT_SIZE.xs, color: '#92400e' },

  errorBox: { backgroundColor: '#fef2f2', borderRadius: 8, padding: SPACING.sm, marginBottom: SPACING.sm },
  errorText: { fontSize: 11, color: '#dc2626', lineHeight: 18 },

  rowPreviewList: { borderRadius: BORDER_RADIUS.md, overflow: 'hidden', marginBottom: SPACING.md },
  rowPreviewHeading: { fontSize: FONT_SIZE.xs, fontWeight: '700', marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  rowPreviewItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  rowPreviewDot: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  rowPreviewNote: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  rowPreviewDate: { fontSize: 10, marginTop: 1 },
  rowPreviewAmt: { fontSize: FONT_SIZE.sm, fontWeight: '700' },
  rowPreviewMore: { fontSize: FONT_SIZE.xs, textAlign: 'center', paddingVertical: SPACING.sm },

  previewActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  cancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: BORDER_RADIUS.md, borderWidth: 1.5 },
  cancelBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
  confirmBtn: { flex: 2, borderRadius: BORDER_RADIUS.md, overflow: 'hidden' },
  confirmGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  confirmText: { fontSize: FONT_SIZE.sm, color: '#fff', fontWeight: '700' },
  noRows: { fontSize: FONT_SIZE.sm, textAlign: 'center', paddingVertical: SPACING.md },
})