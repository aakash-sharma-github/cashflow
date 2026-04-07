// src/screens/ExportImportScreen.tsx
import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { exportEntriesAsCSV, exportEntriesAsPDF, pickAndParseCSV, ImportResult } from '../services/exportService'
import { entriesService } from '../services/entriesService'
import { useEntriesStore } from '../store/entriesStore'
import { useBooksStore } from '../store/booksStore'
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE, SHADOW } from '../constants'
import { formatAmount } from '../utils'

export default function ExportImportScreen({ route, navigation }: any) {
  const { bookId } = route.params
  const { currentBook } = useBooksStore()
  const { entries } = useEntriesStore()

  const [csvLoading, setCsvLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)

  if (!currentBook) return null

  const handleExportCSV = async () => {
    setCsvLoading(true)
    try {
      // Fetch ALL entries (no pagination limit) for export
      let allEntries = entries
      if (entries.length < (currentBook.member_count || 1) * 30) {
        const { data } = await entriesService.getEntries(bookId, 'all', 0)
        if (data) allEntries = data
      }
      await exportEntriesAsCSV(allEntries, currentBook)
    } catch (e: any) {
      Alert.alert('Export Failed', e.message)
    } finally {
      setCsvLoading(false)
    }
  }

  const handleExportPDF = async () => {
    setPdfLoading(true)
    try {
      let allEntries = entries
      const { data } = await entriesService.getEntries(bookId, 'all', 0)
      if (data) allEntries = data
      await exportEntriesAsPDF(allEntries, currentBook)
    } catch (e: any) {
      Alert.alert('Export Failed', e.message)
    } finally {
      setPdfLoading(false)
    }
  }

  const handlePickCSV = async () => {
    setImportLoading(true)
    try {
      const result = await pickAndParseCSV()
      if (!result) { setImportLoading(false); return }
      setImportPreview(result)
    } catch (e: any) {
      Alert.alert('Could not read file', e.message)
    } finally {
      setImportLoading(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) return

    Alert.alert(
      `Import ${importPreview.rows.length} entries?`,
      `This will add ${importPreview.rows.length} entries to "${currentBook.name}". This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            setImporting(true)
            let success = 0, failed = 0

            for (const row of importPreview.rows) {
              const { error } = await entriesService.createEntry(bookId, {
                amount: String(row.amount),
                type: row.type,
                note: row.note || '',
                entry_date: new Date(row.entry_date),
              })
              if (error) failed++
              else success++
            }

            setImporting(false)
            setImportPreview(null)

            // Refresh entries
            useEntriesStore.getState().fetchEntries(bookId)

            Alert.alert(
              'Import Complete ✅',
              `${success} entries imported successfully.${failed > 0 ? `\n${failed} failed.` : ''}`,
            )
          },
        },
      ]
    )
  }

  const renderImportPreview = () => {
    if (!importPreview) return null
    const cashIn = importPreview.rows.filter(r => r.type === 'cash_in').reduce((s, r) => s + r.amount, 0)
    const cashOut = importPreview.rows.filter(r => r.type === 'cash_out').reduce((s, r) => s + r.amount, 0)

    return (
      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>📄 Import Preview</Text>

        <View style={styles.previewStats}>
          <View style={styles.previewStat}>
            <Text style={styles.previewStatNum}>{importPreview.rows.length}</Text>
            <Text style={styles.previewStatLabel}>entries</Text>
          </View>
          <View style={styles.previewStat}>
            <Text style={[styles.previewStatNum, { color: COLORS.cashIn }]}>
              +{formatAmount(cashIn, currentBook.currency)}
            </Text>
            <Text style={styles.previewStatLabel}>cash in</Text>
          </View>
          <View style={styles.previewStat}>
            <Text style={[styles.previewStatNum, { color: COLORS.cashOut }]}>
              -{formatAmount(cashOut, currentBook.currency)}
            </Text>
            <Text style={styles.previewStatLabel}>cash out</Text>
          </View>
        </View>

        {importPreview.skipped > 0 && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>⚠️ {importPreview.skipped} rows skipped (invalid data)</Text>
          </View>
        )}

        {importPreview.errors.slice(0, 3).map((e, i) => (
          <Text key={i} style={styles.errorRow}>• {e}</Text>
        ))}

        {importPreview.rows.length > 0 && (
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.cancelImportBtn}
              onPress={() => setImportPreview(null)}
            >
              <Text style={styles.cancelImportText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmImportBtn, importing && { opacity: 0.6 }]}
              onPress={handleConfirmImport}
              disabled={importing}
            >
              {importing
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.confirmImportText}>
                    Import {importPreview.rows.length} Entries
                  </Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {importPreview.rows.length === 0 && (
          <Text style={styles.noRowsText}>No valid rows found in this file.</Text>
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* EXPORT SECTION */}
        <Text style={styles.sectionTitle}>Export</Text>
        <Text style={styles.sectionSubtitle}>
          Download all entries from "{currentBook.name}"
        </Text>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={handleExportCSV}
          disabled={csvLoading}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#ecfdf5' }]}>
            <Text style={styles.actionEmoji}>📊</Text>
          </View>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Export as CSV</Text>
            <Text style={styles.actionDesc}>
              Spreadsheet-compatible. Open in Excel, Google Sheets, or Numbers.
            </Text>
          </View>
          {csvLoading
            ? <ActivityIndicator color={COLORS.primary} />
            : <Text style={styles.actionArrow}>→</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={handleExportPDF}
          disabled={pdfLoading}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#fef2f2' }]}>
            <Text style={styles.actionEmoji}>📑</Text>
          </View>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Export as PDF</Text>
            <Text style={styles.actionDesc}>
              Formatted report with summary and full transaction list.
            </Text>
          </View>
          {pdfLoading
            ? <ActivityIndicator color={COLORS.primary} />
            : <Text style={styles.actionArrow}>→</Text>
          }
        </TouchableOpacity>

        {/* IMPORT SECTION */}
        <Text style={[styles.sectionTitle, { marginTop: SPACING.xl }]}>Import</Text>
        <Text style={styles.sectionSubtitle}>
          Import entries from a CSV file into "{currentBook.name}"
        </Text>

        <View style={styles.csvFormatCard}>
          <Text style={styles.csvFormatTitle}>📋 Expected CSV format</Text>
          <Text style={styles.csvFormatCode}>Date, Type, Amount, Note</Text>
          <Text style={styles.csvFormatCode}>2024-01-15, Cash In, 500.00, Salary</Text>
          <Text style={styles.csvFormatCode}>2024-01-16, Cash Out, 120.00, Groceries</Text>
          <Text style={styles.csvFormatNote}>
            Type column accepts: "Cash In" / "Cash Out" / "in" / "out"
          </Text>
        </View>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={handlePickCSV}
          disabled={importLoading}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIcon, { backgroundColor: COLORS.primaryLight }]}>
            <Text style={styles.actionEmoji}>📂</Text>
          </View>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Choose CSV File</Text>
            <Text style={styles.actionDesc}>
              Pick a .csv file from your device to preview and import.
            </Text>
          </View>
          {importLoading
            ? <ActivityIndicator color={COLORS.primary} />
            : <Text style={styles.actionArrow}>→</Text>
          }
        </TouchableOpacity>

        {renderImportPreview()}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 60 },

  sectionTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  sectionSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },

  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  actionIcon: {
    width: 48, height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  actionEmoji: { fontSize: 24 },
  actionInfo: { flex: 1 },
  actionTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  actionDesc: { fontSize: FONT_SIZE.xs, color: COLORS.textSecondary, lineHeight: 18 },
  actionArrow: { fontSize: FONT_SIZE.xl, color: COLORS.textTertiary, marginLeft: SPACING.sm },

  csvFormatCard: {
    backgroundColor: '#1e293b',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  csvFormatTitle: { fontSize: FONT_SIZE.sm, color: '#94a3b8', fontWeight: '700', marginBottom: SPACING.sm },
  csvFormatCode: { fontSize: 12, color: '#86efac', fontFamily: 'monospace', lineHeight: 20 },
  csvFormatNote: { fontSize: FONT_SIZE.xs, color: '#64748b', marginTop: SPACING.sm },

  previewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    ...SHADOW.sm,
  },
  previewTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  previewStats: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  previewStat: { flex: 1, alignItems: 'center', padding: SPACING.sm, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md },
  previewStatNum: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.text },
  previewStatLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textTertiary, marginTop: 2 },
  warningBanner: { backgroundColor: '#fffbeb', borderRadius: BORDER_RADIUS.sm, padding: SPACING.sm, marginBottom: SPACING.sm },
  warningText: { fontSize: FONT_SIZE.xs, color: '#92400e' },
  errorRow: { fontSize: FONT_SIZE.xs, color: COLORS.cashOut, marginBottom: 2 },
  previewActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  cancelImportBtn: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border },
  cancelImportText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, fontWeight: '600' },
  confirmImportBtn: { flex: 2, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.primary },
  confirmImportText: { fontSize: FONT_SIZE.sm, color: '#fff', fontWeight: '700' },
  noRowsText: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: SPACING.md },
})
