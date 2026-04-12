// src/services/exportService.ts
// CSV export/import and PDF export for CashFlow entries.
// CSV format matches the CashBook export format:
//   Date, Time, Remark (Note), Entry by, Cash In, Cash Out, Balance
// This lets users import from apps like CashBook and export back to the same format.

import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import * as Print from 'expo-print'
import * as DocumentPicker from 'expo-document-picker'
import { format, parse, isValid } from 'date-fns'
import type { Entry, Book } from '../types'

// ─── Helpers ─────────────────────────────────────────────────

function esc(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

async function shareFile(uri: string, mimeType: string, dialogTitle: string) {
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing is not available on this device')
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: mimeType })
}

// ─── CSV Export ───────────────────────────────────────────────
// Format: Date, Time, Remark, Entry by, Cash In, Cash Out, Balance
// Compatible with CashBook and other cash-tracking apps.

export async function exportEntriesAsCSV(entries: Entry[], book: Book): Promise<void> {
  // Sort oldest first for running balance calculation
  const sorted = [...entries].sort(
    (a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
  )

  let balance = 0
  const rows = sorted.map(e => {
    const isCashIn = e.type === 'cash_in'
    const amount = Number(e.amount)
    balance += isCashIn ? amount : -amount
    const entryBy = e.profile?.full_name || e.profile?.email || ''
    return [
      format(new Date(e.entry_date), 'MM-dd-yy'),         // Date (MM-DD-YY)
      format(new Date(e.entry_date), 'HH:mm'),             // Time (24h)
      e.note || '',                                          // Remark
      entryBy,                                              // Entry by
      isCashIn ? amount.toFixed(2) : '',                   // Cash In
      !isCashIn ? amount.toFixed(2) : '',                   // Cash Out
      balance.toFixed(2),                                   // Balance
    ]
  })

  const csvContent = [
    `# CashFlow Export — ${book.name}`,
    `# Book: ${book.name}${book.description ? ` (${book.description})` : ''}`,
    `# Currency: ${book.currency}`,
    `# Exported: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`,
    `# Total entries: ${entries.length}`,
    '',
    ['Date', 'Time', 'Remark', 'Entry by', 'Cash In', 'Cash Out', 'Balance']
      .map(esc).join(','),
    ...rows.map(row => row.map(esc).join(',')),
  ].join('\n')

  const filename = `cashflow_${book.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`
  const fileUri = (FileSystem.cacheDirectory ?? '') + filename
  await FileSystem.writeAsStringAsync(fileUri, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  })
  await shareFile(fileUri, 'text/csv', `Export ${book.name}`)
}

// ─── PDF Export ───────────────────────────────────────────────
// Branded PDF report with logo, summary cards, and full transaction table.
// Compatible with standard PDF viewers.

// App icon as base64 — embedded so PDF looks correct without network
const APP_ICON_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAQACAYAAAB/HSuD'

export async function exportEntriesAsPDF(entries: Entry[], book: Book): Promise<void> {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
  )

  const cashIn = entries.filter(e => e.type === 'cash_in').reduce((s, e) => s + Number(e.amount), 0)
  const cashOut = entries.filter(e => e.type === 'cash_out').reduce((s, e) => s + Number(e.amount), 0)
  const balance = cashIn - cashOut
  const isPositive = balance >= 0

  // Build running balance for table
  let running = 0
  const tableRows = sorted.map(e => {
    const isCashIn = e.type === 'cash_in'
    const amount = Number(e.amount)
    running += isCashIn ? amount : -amount
    const entryBy = e.profile?.full_name || e.profile?.email || '—'
    const runningColor = running >= 0 ? '#059669' : '#dc2626'

    return `
      <tr>
        <td class="td-date">
          <div class="date-main">${format(new Date(e.entry_date), 'dd MMM yyyy')}</div>
          <div class="date-time">${format(new Date(e.entry_date), 'hh:mm a')}</div>
        </td>
        <td class="td-remark">${e.note ? esc(e.note) : '<span class="muted">—</span>'}</td>
        <td class="td-entryby">${esc(entryBy)}</td>
        <td class="td-amount ${isCashIn ? 'cash-in' : ''}">
          ${isCashIn ? `+${book.currency} ${amount.toFixed(2)}` : ''}
        </td>
        <td class="td-amount ${!isCashIn ? 'cash-out' : ''}">
          ${!isCashIn ? `-${book.currency} ${amount.toFixed(2)}` : ''}
        </td>
        <td class="td-balance" style="color:${runningColor}">
          ${running >= 0 ? '' : '-'}${book.currency} ${Math.abs(running).toFixed(2)}
        </td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
      background: #fff; color: #111827;
      padding: 32px 36px; font-size: 13px;
    }

    /* ── Header ── */
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding-bottom: 20px;
      border-bottom: 3px solid ${book.color ?? '#5B5FED'};
      margin-bottom: 24px;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .app-logo {
      width: 52px; height: 52px; border-radius: 14px;
      object-fit: cover; display: block;
    }
    .app-name { font-size: 11px; font-weight: 800; color: #9ca3af; letter-spacing: 2px; text-transform: uppercase; }
    .book-title { font-size: 22px; font-weight: 800; color: #111827; letter-spacing: -0.5px; margin-top: 2px; }
    .book-desc { font-size: 11px; color: #9ca3af; margin-top: 2px; }
    .header-right { text-align: right; }
    .meta-label { font-size: 10px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .meta-val { font-size: 12px; color: #374151; margin-top: 1px; }

    /* ── Summary cards ── */
    .summary { display: flex; gap: 12px; margin-bottom: 24px; }
    .card {
      flex: 1; padding: 16px 18px; border-radius: 12px;
      border: 1.5px solid #e5e7eb;
    }
    .card.balance { border-color: ${isPositive ? '#10b981' : '#ef4444'}; background: ${isPositive ? '#f0fdf4' : '#fef2f2'}; }
    .card.in  { background: #f0fdf4; border-color: #a7f3d0; }
    .card.out { background: #fef2f2; border-color: #fecaca; }
    .card-label { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
    .card-value { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
    .card.balance .card-value { color: ${isPositive ? '#059669' : '#dc2626'}; }
    .card.in .card-value  { color: #059669; }
    .card.out .card-value { color: #dc2626; }
    .card-sub { font-size: 11px; color: #9ca3af; margin-top: 4px; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead tr { background: #f9fafb; }
    thead th {
      padding: 10px 8px; font-size: 10px; font-weight: 700;
      color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px;
      border-bottom: 2px solid #e5e7eb; text-align: left;
    }
    thead th.right { text-align: right; }
    tr:nth-child(even) { background: #fafafa; }
    tr:hover { background: #f3f4f6; }
    .td-date { padding: 9px 8px; white-space: nowrap; }
    .date-main { font-size: 12px; color: #374151; font-weight: 600; }
    .date-time { font-size: 10px; color: #9ca3af; margin-top: 1px; }
    .td-remark { padding: 9px 8px; color: #374151; max-width: 180px; word-break: break-word; }
    .td-entryby { padding: 9px 8px; color: #6b7280; font-size: 11px; white-space: nowrap; }
    .td-amount { padding: 9px 8px; font-weight: 700; font-size: 13px; text-align: right; white-space: nowrap; }
    .cash-in  { color: #059669; }
    .cash-out { color: #dc2626; }
    .td-balance { padding: 9px 8px; font-weight: 700; font-size: 12px; text-align: right; white-space: nowrap; }
    .muted { color: #9ca3af; }

    /* ── Footer ── */
    .footer {
      margin-top: 28px; padding-top: 14px;
      border-top: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; align-items: center;
    }
    .footer-brand { font-size: 11px; font-weight: 700; color: #9ca3af; }
    .footer-meta  { font-size: 10px; color: #c4c4c4; }
  </style>
</head>
<body>

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#5B5FED,#7C3AED);display:flex;align-items:center;justify-content:center;">
        <span style="color:#fff;font-size:24px;">💰</span>
      </div>
      <div>
        <div class="app-name">CashFlow</div>
        <div class="book-title">${esc(book.name)}</div>
        ${book.description ? `<div class="book-desc">${esc(book.description)}</div>` : ''}
      </div>
    </div>
    <div class="header-right">
      <div class="meta-label">Exported</div>
      <div class="meta-val">${format(new Date(), 'dd MMM yyyy, hh:mm a')}</div>
      <div class="meta-label" style="margin-top:6px">Currency</div>
      <div class="meta-val">${book.currency}</div>
      <div class="meta-label" style="margin-top:6px">Total Entries</div>
      <div class="meta-val">${entries.length}</div>
    </div>
  </div>

  <!-- Summary cards -->
  <div class="summary">
    <div class="card balance">
      <div class="card-label">Net Balance</div>
      <div class="card-value">${isPositive ? '' : '-'}${book.currency} ${Math.abs(balance).toFixed(2)}</div>
      <div class="card-sub">${isPositive ? 'Positive balance' : 'Negative balance'}</div>
    </div>
    <div class="card in">
      <div class="card-label">↑ Total Cash In</div>
      <div class="card-value">${book.currency} ${cashIn.toFixed(2)}</div>
      <div class="card-sub">${entries.filter(e => e.type === 'cash_in').length} entries</div>
    </div>
    <div class="card out">
      <div class="card-label">↓ Total Cash Out</div>
      <div class="card-value">${book.currency} ${cashOut.toFixed(2)}</div>
      <div class="card-sub">${entries.filter(e => e.type === 'cash_out').length} entries</div>
    </div>
  </div>

  <!-- Transaction table -->
  <table>
    <thead>
      <tr>
        <th>Date & Time</th>
        <th>Remark / Note</th>
        <th>Entry By</th>
        <th class="right">Cash In</th>
        <th class="right">Cash Out</th>
        <th class="right">Balance</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || `<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af;">No entries found</td></tr>`}
    </tbody>
  </table>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-brand">💰 CashFlow — Smart Expense Tracker</div>
    <div class="footer-meta">Generated ${format(new Date(), 'yyyy-MM-dd HH:mm')} · Made with ❤️ by Aakash Sharma</div>
  </div>

</body>
</html>`

  const { uri } = await Print.printToFileAsync({ html, base64: false })
  const filename = `cashflow_${book.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`
  const destUri = (FileSystem.cacheDirectory ?? '') + filename
  await FileSystem.moveAsync({ from: uri, to: destUri })
  await shareFile(destUri, 'application/pdf', `Export ${book.name} as PDF`)
}

// ─── Types ────────────────────────────────────────────────────

export interface ParsedEntryRow {
  amount: number
  type: 'cash_in' | 'cash_out'
  note: string | null
  entry_date: string
}

export interface ImportResult {
  rows: ParsedEntryRow[]
  skipped: number
  errors: string[]
}

// ─── CSV Import ───────────────────────────────────────────────
// Accepts the CashBook CSV format AND our own export format.
//
// Supported column layouts (auto-detected, case-insensitive):
//
// Layout A — CashBook format:
//   Date, Time, Remark, Entry by, Cash In, Cash Out, Balance
//
// Layout B — Simple format:
//   Date, Type, Amount, Note  (or Date, Time, Type, Amount, Note)
//
// Type column accepts: Cash In / in / income / credit / + / Cash Out / out / expense / debit / -

export async function pickAndParseCSV(): Promise<ImportResult | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
  })

  if (result.canceled || !result.assets?.[0]) return null

  const raw = await FileSystem.readAsStringAsync(result.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  })

  return parseCSVContent(raw)
}

export function parseCSVContent(raw: string): ImportResult {
  // Strip BOM (UTF-8 BOM = \uFEFF)
  const clean = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const allLines = clean.split('\n')

  // Find header row (first non-comment, non-empty row)
  let headerIndex = -1
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim()
    if (!line || line.startsWith('#')) continue
    headerIndex = i
    break
  }

  if (headerIndex === -1) return { rows: [], skipped: 0, errors: ['No header row found'] }

  // Parse header — handle quoted fields
  const headers = parseCSVLine(allLines[headerIndex]).map(h => h.toLowerCase().trim())

  // Detect layout
  const hasDate = headers.findIndex(h => h === 'date')
  const hasTime = headers.findIndex(h => h === 'time')
  const hasCashIn = headers.findIndex(h => h === 'cash in' || h === 'cash_in' || h === 'cashin')
  const hasCashOut = headers.findIndex(h => h === 'cash out' || h === 'cash_out' || h === 'cashout')
  const hasType = headers.findIndex(h => h === 'type')
  const hasAmount = headers.findIndex(h => h === 'amount')
  const hasRemark = headers.findIndex(h => h === 'remark' || h === 'note' || h === 'description' || h === 'memo' || h === 'narration')
  const hasBalance = headers.findIndex(h => h === 'balance')

  // Determine which layout we're dealing with
  const isCashBookLayout = hasCashIn !== -1 && hasCashOut !== -1

  const rows: ParsedEntryRow[] = []
  const errors: string[] = []
  let skipped = 0

  const dataLines = allLines.slice(headerIndex + 1)

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i].trim()
    if (!line || line.startsWith('#')) { skipped++; continue }

    const cells = parseCSVLine(line)
    if (cells.length < 2) { skipped++; continue }

    const getCell = (idx: number) => (idx >= 0 && idx < cells.length ? cells[idx].trim() : '')

    // ── Build date string ──
    let dateStr = getCell(hasDate)
    const timeStr = hasTime >= 0 ? getCell(hasTime) : ''

    // Normalise various date formats: MM-DD-YY, MM/DD/YY, YYYY-MM-DD, DD-MM-YYYY, etc.
    let parsedDate: Date | null = null

    // Try multiple formats
    const dateFormats = [
      'MM-dd-yy', 'MM/dd/yy', 'MM-dd-yyyy', 'MM/dd/yyyy',
      'yyyy-MM-dd', 'dd-MM-yyyy', 'dd/MM/yyyy',
      'MMM d, yyyy', 'MMMM d, yyyy', 'd MMM yyyy',
      'yyyy-MM-dd HH:mm',
    ]

    const fullDateStr = timeStr ? `${dateStr} ${timeStr}` : dateStr
    for (const fmt of dateFormats) {
      try {
        const candidate = parse(
          timeStr ? fullDateStr : dateStr,
          timeStr ? `${fmt} HH:mm` : fmt,
          new Date()
        )
        if (isValid(candidate)) { parsedDate = candidate; break }
      } catch { }
    }

    // Fallback to native Date parse
    if (!parsedDate) {
      const native = new Date(fullDateStr)
      if (isValid(native)) parsedDate = native
    }

    if (!parsedDate || !isValid(parsedDate)) {
      errors.push(`Row ${i + 2}: Invalid date "${dateStr}" — skipped`)
      skipped++
      continue
    }

    const note = hasRemark >= 0 ? getCell(hasRemark) || null : null

    // ── Parse amount and type ──
    if (isCashBookLayout) {
      // CashBook layout: separate Cash In / Cash Out columns
      const rawIn = getCell(hasCashIn).replace(/[^0-9.]/g, '')
      const rawOut = getCell(hasCashOut).replace(/[^0-9.]/g, '')

      const amtIn = rawIn ? parseFloat(rawIn) : 0
      const amtOut = rawOut ? parseFloat(rawOut) : 0

      if (amtIn > 0) {
        rows.push({ amount: amtIn, type: 'cash_in', note, entry_date: parsedDate.toISOString() })
      } else if (amtOut > 0) {
        rows.push({ amount: amtOut, type: 'cash_out', note, entry_date: parsedDate.toISOString() })
      } else {
        // Both zero — could be a balance-only row (like an opening balance row), skip
        skipped++
      }
    } else {
      // Simple layout: Type + Amount columns
      const rawType = getCell(hasType).toLowerCase()
      const rawAmount = getCell(hasAmount).replace(/[^0-9.]/g, '')
      const amount = parseFloat(rawAmount)

      if (isNaN(amount) || amount <= 0) {
        errors.push(`Row ${i + 2}: Invalid amount — skipped`)
        skipped++; continue
      }

      let type: 'cash_in' | 'cash_out' | null = null
      if (['cash in', 'cashin', 'cash_in', 'in', 'income', 'credit', '+', 'received', 'deposit'].includes(rawType)) {
        type = 'cash_in'
      } else if (['cash out', 'cashout', 'cash_out', 'out', 'expense', 'debit', '-', 'payment', 'withdrawal'].includes(rawType)) {
        type = 'cash_out'
      }

      if (!type) {
        errors.push(`Row ${i + 2}: Unknown type "${getCell(hasType)}" — skipped`)
        skipped++; continue
      }

      rows.push({ amount, type, note, entry_date: parsedDate.toISOString() })
    }
  }

  return { rows, skipped, errors }
}

// ─── CSV line parser ─────────────────────────────────────────
// Handles quoted fields properly (e.g. "1,08,000" in the Balance column)
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 2
      } else {
        inQuotes = !inQuotes
        i++
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
      i++
    } else {
      current += ch
      i++
    }
  }
  result.push(current)
  return result
}