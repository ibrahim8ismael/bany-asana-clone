export type CsvRow = Record<string, string>

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ""
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && char === ",") {
      currentRow.push(currentValue)
      currentValue = ""
      continue
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1
      }

      currentRow.push(currentValue)
      if (currentRow.some((value) => value.length > 0)) {
        rows.push(currentRow)
      }
      currentRow = []
      currentValue = ""
      continue
    }

    currentValue += char
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue)
    if (currentRow.some((value) => value.length > 0)) {
      rows.push(currentRow)
    }
  }

  if (rows.length === 0) return []

  const [headerRow, ...bodyRows] = rows
  const headers = headerRow.map((header) => header.trim().replace(/^\uFEFF/, ""))

  return bodyRows.map((row) => {
    const record: CsvRow = {}

    headers.forEach((header, headerIndex) => {
      record[header] = row[headerIndex]?.trim() ?? ""
    })

    return record
  })
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return ""

  const stringValue = String(value)
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}

export function stringifyCsv(headers: string[], rows: Array<Record<string, string | number | boolean | null | undefined>>) {
  const headerLine = headers.map((header) => escapeCsvValue(header)).join(",")
  const bodyLines = rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))

  return [headerLine, ...bodyLines].join("\r\n")
}
