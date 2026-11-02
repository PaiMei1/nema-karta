// Parser CSV-a (podržava , ; tab, navodnike, BOM, decimalni zarez)
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '')
  const first = text.split(/\r?\n/)[0] || ''
  const delim = [',', ';', '\t']
    .map((d) => [d, first.split(d).length])
    .sort((a, b) => b[1] - a[1])[0][0]

  const rows = []
  let row = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else q = false
      } else field += c
    } else if (c === '"') q = true
    else if (c === delim) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

const norm = (s) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const MAP_ALIASES = {
  svet: 'svet',
  world: 'svet',
  balkan: 'balkan',
  balkans: 'balkan',
  srbija: 'srbija',
  serbia: 'srbija',
}

export function toPoints(text) {
  const rows = parseCSV(text)
  if (rows.length < 2) throw new Error('CSV je prazan ili nema redova sa podacima.')
  const header = rows[0].map(norm)
  const find = (names) => header.findIndex((h) => names.includes(h))
  const iName = find(['toponim', 'naziv', 'name', 'pojam', 'ime'])
  const iLat = find(['lat', 'latitude', 'sirina'])
  const iLon = find(['lon', 'lng', 'long', 'longitude', 'duzina'])
  const iMap = find(['mapa', 'map'])
  if (iName < 0 || iLat < 0 || iLon < 0) {
    throw new Error('CSV mora imati zaglavlje sa kolonama: toponim, lat, lon (opciono: mapa).')
  }

  const points = []
  const skipped = []
  const maps = new Set()
  rows.slice(1).forEach((r, i) => {
    const name = (r[iName] || '').trim()
    const lat = Number((r[iLat] || '').trim().replace(',', '.'))
    const lon = Number((r[iLon] || '').trim().replace(',', '.'))
    const bad =
      !name ||
      (r[iLat] || '').trim() === '' ||
      (r[iLon] || '').trim() === '' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    if (bad) {
      skipped.push(name || `red ${i + 2}`)
      return
    }
    points.push({ id: points.length, name, lat, lon })
    if (iMap >= 0) maps.add(MAP_ALIASES[norm(r[iMap] || '')] || '')
  })

  let mapa = null
  if (iMap >= 0 && maps.size === 1) {
    const v = [...maps][0]
    if (v) mapa = v
  }
  return { points, skipped, mapa }
}
