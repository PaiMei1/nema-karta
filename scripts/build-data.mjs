// Preuzima Natural Earth podatke (reke, okruzi) i pravi male fajlove u src/data/
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { topology } from 'topojson-server'
import { mesh } from 'topojson-client'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'src', 'data')
fs.mkdirSync(out, { recursive: true })

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
const get = async (name) => {
  console.log('Preuzimam', name, '...')
  const r = await fetch(BASE + name + '.geojson')
  if (!r.ok) throw new Error(`Greška ${r.status} za ${name}`)
  return r.json()
}

const rnd = (n) => Math.round(n * 1000) / 1000
const roundCoords = (c) => (typeof c[0] === 'number' ? [rnd(c[0]), rnd(c[1])] : c.map(roundCoords))
const lines = (fc, keep) => ({
  type: 'FeatureCollection',
  features: fc.features
    .filter((f) => f.geometry && keep(f))
    .map((f) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
    })),
})
const pts = (g) => {
  const c = []
  const w = (x) => (typeof x[0] === 'number' ? c.push(x) : x.forEach(w))
  w(g.coordinates)
  return c
}
const inBox = (f, [w, s, e, n]) => pts(f.geometry).some((p) => p[0] >= w && p[0] <= e && p[1] >= s && p[1] <= n)
const isRiver = (f) => !/lake/i.test(f.properties.featurecla || '')

const centerlines = await get('ne_10m_rivers_lake_centerlines')
const europe = await get('ne_10m_rivers_europe')

// Svet: samo veće reke
const world = lines(centerlines, (f) => isRiver(f) && (f.properties.scalerank ?? 99) <= 5)
fs.writeFileSync(path.join(out, 'rivers-world.json'), JSON.stringify(world))

// Balkan i Srbija: sve reke u okviru Balkana
const BOX = [12, 34, 31, 47.5]
const region = lines(
  { features: [...centerlines.features, ...europe.features] },
  (f) => isRiver(f) && inBox(f, BOX),
)
fs.writeFileSync(path.join(out, 'rivers-region.json'), JSON.stringify(region))

// Granice AP Vojvodine i AP Kosovo i Metohija (spajanjem okruga)
const adm = await get('ne_10m_admin_1_states_provinces')
const VOJ = ['Severno-Backi', 'Zapadno-Backi', 'Južno-Backi', 'Severno-Banatski', 'Srednje-Banatski', 'Južno-Banatski', 'Sremski']
const feats = adm.features
  .filter((f) => f.properties.adm0_a3 === 'SRB' || f.properties.adm0_a3 === 'KOS')
  .map((f) => ({
    type: 'Feature',
    properties: {
      group: f.properties.adm0_a3 === 'KOS' ? 'KIM' : VOJ.includes(f.properties.name) ? 'VOJ' : 'CS',
    },
    geometry: f.geometry,
  }))
const topo = topology({ d: { type: 'FeatureCollection', features: feats } }, 1e5)
const border = mesh(topo, topo.objects.d, (a, b) => a !== b && a.properties.group !== b.properties.group)
fs.writeFileSync(
  path.join(out, 'borders-ap.json'),
  JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: border.type, coordinates: roundCoords(border.coordinates) } }),
)
console.log('Gotovo.')
