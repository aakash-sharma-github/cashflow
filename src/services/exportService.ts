// src/services/exportService.ts
// Handles CSV export, PDF export, and CSV import for entries.
// Uses expo-file-system, expo-sharing, and expo-print (all free, bundled with Expo).

import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as Print from 'expo-print'
import * as DocumentPicker from 'expo-document-picker'
import { format } from 'date-fns'
import type { Entry, Book } from '../types'

// ─── Helpers ─────────────────────────────────────────────────

function escapeCsvValue(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  // Wrap in quotes if contains comma, newline, or quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${Math.abs(amount).toFixed(2)}`
}

// ─── CSV Export ──────────────────────────────────────────────

export async function exportEntriesAsCSV(
  entries: Entry[],
  book: Book
): Promise<void> {
  const headers = ['Date', 'Type', 'Amount', 'Currency', 'Note', 'Added By']
  const rows = entries.map(e => [
    format(new Date(e.entry_date), 'yyyy-MM-dd HH:mm'),
    e.type === 'cash_in' ? 'Cash In' : 'Cash Out',
    e.amount.toFixed(2),
    book.currency,
    e.note || '',
    e.profile?.full_name || e.profile?.email || '',
  ])

  const csvContent = [
    `# CashFlow Export - ${book.name}`,
    `# Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
    `# Currency: ${book.currency}`,
    '',
    headers.map(escapeCsvValue).join(','),
    ...rows.map(row => row.map(escapeCsvValue).join(',')),
  ].join('\n')

  const filename = `cashflow_${book.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.csv`
  const fileUri = FileSystem.cacheDirectory + filename

  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  })

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing is not available on this device')

  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: `Export ${book.name}`,
    UTI: 'public.comma-separated-values-text',
  })
}

// ─── PDF Export ──────────────────────────────────────────────

export async function exportEntriesAsPDF(
  entries: Entry[],
  book: Book
): Promise<void> {
  const cashIn = entries.filter(e => e.type === 'cash_in').reduce((s, e) => s + Number(e.amount), 0)
  const cashOut = entries.filter(e => e.type === 'cash_out').reduce((s, e) => s + Number(e.amount), 0)
  const balance = cashIn - cashOut
  const isPositive = balance >= 0

  const tableRows = entries.map(e => `
    <tr style="border-bottom: 1px solid #f0f0f0;">
      <td style="padding: 10px 8px; color: #374151; font-size: 13px;">
        ${format(new Date(e.entry_date), 'MMM d, yyyy')}
        <br/><span style="font-size: 11px; color: #9ca3af;">${format(new Date(e.entry_date), 'h:mm a')}</span>
      </td>
      <td style="padding: 10px 8px;">
        <span style="
          display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;
          background: ${e.type === 'cash_in' ? '#d1fae5' : '#fee2e2'};
          color: ${e.type === 'cash_in' ? '#059669' : '#dc2626'};
        ">
          ${e.type === 'cash_in' ? '↑ Cash In' : '↓ Cash Out'}
        </span>
      </td>
      <td style="padding: 10px 8px; font-weight: 700; font-size: 14px; color: ${e.type === 'cash_in' ? '#059669' : '#dc2626'}; text-align: right;">
        ${e.type === 'cash_in' ? '+' : '-'}${book.currency} ${Number(e.amount).toFixed(2)}
      </td>
      <td style="padding: 10px 8px; color: #6b7280; font-size: 12px;">
        ${escapeCsvValue(e.note || '—')}
      </td>
    </tr>
  `).join('')

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; background: #fff; color: #111827; padding: 40px; }
        .header { margin-bottom: 32px; border-bottom: 2px solid ${book.color}; padding-bottom: 20px; }
        .logo { font-size: 13px; font-weight: 800; color: #9ca3af; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }
        .book-title { font-size: 28px; font-weight: 800; color: #111827; letter-spacing: -0.5px; }
        .export-meta { font-size: 12px; color: #9ca3af; margin-top: 4px; }
        .summary { display: flex; gap: 16px; margin-bottom: 32px; }
        .summary-card { flex: 1; padding: 20px; border-radius: 12px; }
        .summary-card.balance { background: ${isPositive ? '#ecfdf5' : '#fef2f2'}; border: 2px solid ${isPositive ? '#10b981' : '#ef4444'}; }
        .summary-card.in { background: #ecfdf5; }
        .summary-card.out { background: #fef2f2; }
        .summary-label { font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
        .summary-value { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
        .summary-card.balance .summary-value { color: ${isPositive ? '#059669' : '#dc2626'}; }
        .summary-card.in .summary-value { color: #059669; }
        .summary-card.out .summary-value { color: #dc2626; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #f9fafb; }
        thead th { padding: 12px 8px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; text-align: left; border-bottom: 2px solid #e5e7eb; }
        thead th:last-child { text-align: left; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo">💰 CashFlow</div>
        <div class="book-title">${book.name}</div>
        ${book.description ? `<div class="export-meta">${book.description}</div>` : ''}
        <div class="export-meta">Exported ${format(new Date(), 'MMMM d, yyyy')} · ${entries.length} transaction${entries.length !== 1 ? 's' : ''}</div>
      </div>

      <div class="summary">
        <div class="summary-card balance">
          <div class="summary-label">Net Balance</div>
          <div class="summary-value">${isPositive ? '+' : '-'}${book.currency} ${Math.abs(balance).toFixed(2)}</div>
        </div>
        <div class="summary-card in">
          <div class="summary-label">↑ Total In</div>
          <div class="summary-value">${book.currency} ${cashIn.toFixed(2)}</div>
        </div>
        <div class="summary-card out">
          <div class="summary-label">↓ Total Out</div>
          <div class="summary-value">${book.currency} ${cashOut.toFixed(2)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th style="text-align:right">Amount</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="4" style="text-align:center;padding:40px;color:#9ca3af;">No entries found</td></tr>'}
        </tbody>
      </table>

      <div class="footer">
        Generated by CashFlow · ${format(new Date(), 'yyyy-MM-dd HH:mm')}
      </div>
    </body>
    </html>
  `

  const { uri } = await Print.printToFileAsync({ html, base64: false })

  const filename = `cashflow_${book.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`
  const destUri = FileSystem.cacheDirectory + filename
  await FileSystem.moveAsync({ from: uri, to: destUri })

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing is not available on this device')

  await Sharing.shareAsync(destUri, {
    mimeType: 'application/pdf',
    dialogTitle: `Export ${book.name} as PDF`,
    UTI: 'com.adobe.pdf',
  })
}

// ─── CSV Import ──────────────────────────────────────────────

export interface ParsedEntryRow {
  amount: number
  type: 'cash_in' | 'cash_out'
  note: string | null
  entry_date: string
  error?: string
}

export interface ImportResult {
  rows: ParsedEntryRow[]
  skipped: number
  errors: string[]
}

/**
 * Let user pick a CSV file and parse it into entry rows.
 * Expected columns (case-insensitive): Date, Type, Amount, Note
 * Type column accepts: "cash in", "in", "cash_in" → cash_in | "cash out", "out", "cash_out" → cash_out
 */
export async function pickAndParseCSV(): Promise<ImportResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'public.comma-separated-values-text'],
    copyToCacheDirectory: true,
  })

  if (result.canceled || !result.assets?.[0]) return null

  const fileUri = result.assets[0].uri
  const content = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.UTF8,
  })

  return parseCSVContent(content)
}

export function parseCSVContent(content: string): ImportResult {
  const rows: ParsedEntryRow[] = []
  const errors: string[] = []
  let skipped = 0

  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))

  if (lines.length < 2) {
    return { rows: [], skipped: 0, errors: ['File appears to be empty or has no data rows'] }
  }

  // Parse header row
  const headerLine = lines[0]
  const headers = parseCSVRow(headerLine).map(h => h.toLowerCase().trim())

  const colIndex = {
    date: headers.findIndex(h => h.includes('date')),
    type: headers.findIndex(h => h.includes('type')),
    amount: headers.findIndex(h => h.includes('amount')),
    note: headers.findIndex(h => h.includes('note') || h.includes('description') || h.includes('memo')),
  }

  if (colIndex.type === -1 || colIndex.amount === -1) {
    return { rows: [], skipped: 0, errors: ['CSV must have "Type" and "Amount" columns'] }
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVRow(lines[i])
    if (cells.length < 2) { skipped++; continue }

    const rawType = cells[colIndex.type]?.toLowerCase().trim() || ''
    const rawAmount = cells[colIndex.amount]?.replace(/[^0-9.]/g, '') || ''
    const rawDate = colIndex.date >= 0 ? cells[colIndex.date]?.trim() : ''
    const rawNote = colIndex.note >= 0 ? cells[colIndex.note]?.trim() : ''

    // Validate type
    let type: 'cash_in' | 'cash_out' | null = null
    if (['cash in', 'cashin', 'cash_in', 'in', 'income', 'credit', '+'].includes(rawType)) type = 'cash_in'
    else if (['cash out', 'cashout', 'cash_out', 'out', 'expense', 'debit', '-'].includes(rawType)) type = 'cash_out'

    if (!type) {
      errors.push(`Row ${i + 1}: Unknown type "${cells[colIndex.type]}" — skipped`)
      skipped++
      continue
    }

    // Validate amount
    const amount = parseFloat(rawAmount)
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${i + 1}: Invalid amount "${cells[colIndex.amount]}" — skipped`)
      skipped++
      continue
    }

    // Parse date (fallback to now)
    let entry_date = new Date().toISOString()
    if (rawDate) {
      const parsed = new Date(rawDate)
      if (!isNaN(parsed.getTime())) entry_date = parsed.toISOString()
    }

    rows.push({ amount, type, note: rawNote || null, entry_date })
  }

  return { rows, skipped, errors }
}

/** Simple CSV row parser that handles quoted fields */
function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ─── Excel Export ─────────────────────────────────────────────

export async function exportEntriesAsExcel(
  entries: Entry[],
  book: Book
): Promise<void> {
  // We build a minimal XLSX file manually using the XLSX library.
  // The xlsx package works in React Native via its CommonJS bundle.
  // We write it as a base64 string then save with FileSystem.

  // Dynamic import to avoid issues if package missing
  let XLSX: any
  try {
    XLSX = require('xlsx')
  } catch {
    throw new Error('xlsx package not installed. Run: npm install xlsx')
  }

  // Build worksheet data
  const wsData: any[][] = [
    // Header row
    ['Date', 'Type', 'Amount', 'Currency', 'Note', 'Added By'],
    // Data rows
    ...entries.map(e => [
      format(new Date(e.entry_date), 'yyyy-MM-dd HH:mm'),
      e.type === 'cash_in' ? 'Cash In' : 'Cash Out',
      Number(e.amount.toFixed(2)),
      book.currency,
      e.note || '',
      e.profile?.full_name || e.profile?.email || '',
    ]),
    // Empty row, then summary
    [],
    ['Summary', '', '', '', '', ''],
    ['Total Cash In', '', entries.filter(e => e.type === 'cash_in').reduce((s, e) => s + Number(e.amount), 0), book.currency, '', ''],
    ['Total Cash Out', '', entries.filter(e => e.type === 'cash_out').reduce((s, e) => s + Number(e.amount), 0), book.currency, '', ''],
    ['Net Balance', '', entries.reduce((s, e) => s + (e.type === 'cash_in' ? 1 : -1) * Number(e.amount), 0), book.currency, '', ''],
    ['Exported', '', format(new Date(), 'yyyy-MM-dd HH:mm'), '', '', ''],
  ]

  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Style header row (column widths)
  ws['!cols'] = [
    { wch: 18 }, // Date
    { wch: 12 }, // Type
    { wch: 12 }, // Amount
    { wch: 8 }, // Currency
    { wch: 30 }, // Note
    { wch: 24 }, // Added By
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, book.name.slice(0, 31)) // sheet name max 31 chars

  // Write to base64
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' })

  const filename = `cashflow_${book.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`
  const fileUri = FileSystem.cacheDirectory + filename

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing is not available on this device')

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: `Export ${book.name} as Excel`,
    UTI: 'com.microsoft.excel.xlsx',
  })
}

// ─── Excel / XLSM Import ──────────────────────────────────────

/**
 * Let user pick an .xlsx or .xlsm file and parse it into entry rows.
 * XLSM is a macro-enabled Excel workbook — same binary format, just different
 * extension. The xlsx library handles both identically.
 *
 * Expected columns (case-insensitive): Date, Type, Amount, Note
 */
export async function pickAndParseExcel(): Promise<ImportResult | null> {
  let XLSX: any
  try {
    XLSX = require('xlsx')
  } catch {
    throw new Error('xlsx package not installed. Run: npm install xlsx')
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel.sheet.macroEnabled.12',                    // xlsm
      'application/vnd.ms-excel',                                           // xls fallback
      '*/*',                                                                 // Android fallback
    ],
    copyToCacheDirectory: true,
  })

  if (result.canceled || !result.assets?.[0]) return null

  const fileUri = result.assets[0].uri

  // Read as base64 then parse with xlsx
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const wb = XLSX.read(base64, { type: 'base64' })

  // Use first sheet
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { rows: [], skipped: 0, errors: ['Excel file has no sheets'] }
  }

  const ws = wb.Sheets[sheetName]

  // Convert to array of arrays
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    blankrows: false,
  })

  if (raw.length < 2) {
    return { rows: [], skipped: 0, errors: ['Sheet appears to be empty or has no data rows'] }
  }

  // Find header row (first non-empty row)
  const headers: string[] = raw[0].map((h: any) => String(h || '').toLowerCase().trim())

  const colIndex = {
    date: headers.findIndex(h => h.includes('date')),
    type: headers.findIndex(h => h.includes('type')),
    amount: headers.findIndex(h => h.includes('amount')),
    note: headers.findIndex(h => h.includes('note') || h.includes('description') || h.includes('memo')),
  }

  if (colIndex.type === -1 || colIndex.amount === -1) {
    return { rows: [], skipped: 0, errors: ['Excel sheet must have "Type" and "Amount" columns in the header row'] }
  }

  const rows: ParsedEntryRow[] = []
  const errors: string[] = []
  let skipped = 0

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i]
    if (!row || row.every((c: any) => c === '' || c === null || c === undefined)) {
      skipped++
      continue
    }

    const rawType = String(row[colIndex.type] || '').toLowerCase().trim()
    const rawAmount = String(row[colIndex.amount] || '').replace(/[^0-9.]/g, '')
    const rawDate = colIndex.date >= 0 ? row[colIndex.date] : ''
    const rawNote = colIndex.note >= 0 ? String(row[colIndex.note] || '').trim() : ''

    // Validate type
    let type: 'cash_in' | 'cash_out' | null = null
    if (['cash in', 'cashin', 'cash_in', 'in', 'income', 'credit', '+'].includes(rawType)) type = 'cash_in'
    else if (['cash out', 'cashout', 'cash_out', 'out', 'expense', 'debit', '-'].includes(rawType)) type = 'cash_out'

    if (!type) { errors.push(`Row ${i + 1}: Unknown type "${row[colIndex.type]}" — skipped`); skipped++; continue }

    // Validate amount — xlsx may return a number directly
    const amount = typeof row[colIndex.amount] === 'number'
      ? row[colIndex.amount]
      : parseFloat(rawAmount)

    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${i + 1}: Invalid amount "${row[colIndex.amount]}" — skipped`); skipped++; continue
    }

    // Parse date — xlsx returns JS Date objects for date cells, or a number (serial)
    let entry_date = new Date().toISOString()
    if (rawDate) {
      if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        entry_date = rawDate.toISOString()
      } else if (typeof rawDate === 'number') {
        // Excel serial date
        const d = XLSX.SSF.parse_date_code(rawDate)
        if (d) entry_date = new Date(d.y, d.m - 1, d.d).toISOString()
      } else {
        const parsed = new Date(String(rawDate))
        if (!isNaN(parsed.getTime())) entry_date = parsed.toISOString()
      }
    }

    rows.push({ amount, type, note: rawNote || null, entry_date })
  }

  return { rows, skipped, errors }
}