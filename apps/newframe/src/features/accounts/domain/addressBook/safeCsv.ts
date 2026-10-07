import { getAddress, isAddress } from 'ethers'

import { ADDRESS_BOOK_NAME_MAX_LENGTH } from '../../../../app/contracts/state/main.ts'

export interface SafeAddressBookCsv {
  entries: { address: string; name: string }[]
  rows: number
  invalidRows: number
}

function parseCsvRecords(text: string) {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') {
        index++
      }
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || record.length) {
    record.push(field)
    records.push(record)
  }
  return records.filter((fields) => fields.some((value) => value.trim()))
}

export function parseSafeAddressBookCsv(text: string): SafeAddressBookCsv {
  const [header = [], ...records] = parseCsvRecords(text.replace(/^\uFEFF/, ''))
  const columns = header.map((column) => column.trim().toLowerCase())
  const addressColumn = columns.indexOf('address')
  const nameColumn = columns.indexOf('name')
  if (addressColumn < 0 || nameColumn < 0) {
    return { entries: [], rows: records.length, invalidRows: records.length }
  }

  const names = new Map<string, { address: string; name: string }>()
  let invalidRows = 0
  for (const record of records) {
    const address = record[addressColumn]?.trim() ?? ''
    const name = (record[nameColumn] ?? '').trim().slice(0, ADDRESS_BOOK_NAME_MAX_LENGTH).trim()
    if (!isAddress(address) || !name) {
      invalidRows++
      continue
    }
    const key = address.toLowerCase()
    if (!names.has(key)) {
      names.set(key, { address: getAddress(key), name })
    }
  }
  return { entries: [...names.values()], rows: records.length, invalidRows }
}
