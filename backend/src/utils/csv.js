// Minimal CSV utilities (RFC-4180-ish). No external dependencies.

function escapeCell(value) {
  if (value === null || value === undefined) return ''
  let str
  if (value instanceof Date) {
    str = value.toISOString()
  } else if (typeof value === 'object') {
    str = JSON.stringify(value)
  } else {
    str = String(value)
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function getPath(obj, path) {
  if (!obj) return undefined
  if (!path.includes('.')) return obj[path]
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj)
}

/**
 * Convert an array of objects to a CSV string.
 * @param {Array<object>} rows
 * @param {Array<string|{key:string,header?:string,format?:(value:any,row:object)=>any}>} columns
 */
export function rowsToCsv(rows, columns) {
  const cols = (columns || []).map((c) =>
    typeof c === 'string' ? { key: c, header: c } : { header: c.key, ...c }
  )
  if (!cols.length && rows?.length) {
    const keys = new Set()
    for (const row of rows) for (const k of Object.keys(row || {})) keys.add(k)
    for (const k of keys) cols.push({ key: k, header: k })
  }
  const headerLine = cols.map((c) => escapeCell(c.header ?? c.key)).join(',')
  const lines = [headerLine]
  for (const row of rows || []) {
    const cells = cols.map((c) => {
      const raw = getPath(row, c.key)
      const value = typeof c.format === 'function' ? c.format(raw, row) : raw
      return escapeCell(value)
    })
    lines.push(cells.join(','))
  }
  return lines.join('\r\n')
}

/**
 * Parse a CSV string into { headers, rows }.
 * Supports quoted fields, escaped quotes (""), and CRLF/LF line endings.
 */
export function parseCsv(text) {
  if (typeof text !== 'string' || !text.length) return { headers: [], rows: [] }
  const records = []
  let field = ''
  let row = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field)
        field = ''
      } else if (ch === '\r') {
        // handled together with following \n or alone
        if (text[i + 1] === '\n') i++
        row.push(field)
        records.push(row)
        row = []
        field = ''
      } else if (ch === '\n') {
        row.push(field)
        records.push(row)
        row = []
        field = ''
      } else {
        field += ch
      }
    }
  }
  // Flush trailing field/row (if file did not end with newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    records.push(row)
  }
  // Drop trailing empty record produced by terminal newline
  while (records.length && records[records.length - 1].every((c) => c === '')) {
    records.pop()
  }
  if (!records.length) return { headers: [], rows: [] }
  const headers = records.shift().map((h) => h.trim())
  const rows = records.map((cells) => {
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? ''
    })
    return obj
  })
  return { headers, rows }
}
