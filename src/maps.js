import { geoMercator, geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature, merge } from 'topojson-client'

export const W = 1000
export const H = 700
const PAD = 20

// bbox = [zapad, jug, istok, sever]
export const MAPS = {
  svet: { label: 'Svet', bbox: null, detail: '50m' },
  balkan: { label: 'Balkan', bbox: [12.5, 34.5, 30, 47], detail: '10m' },
  srbija: { label: 'Srbija', bbox: [18.7, 42.1, 23.1, 46.3], detail: '10m' },
}

export function guessMap(points) {
  const inside = (b) =>
    points.length > 0 &&
    points.every((p) => p.lon >= b[0] && p.lon <= b[2] && p.lat >= b[1] && p.lat <= b[3])
  if (inside(MAPS.srbija.bbox)) return 'srbija'
  if (inside(MAPS.balkan.bbox)) return 'balkan'
  return 'svet'
}

const cache = {}
function loadTopo(detail) {
  if (!cache[detail]) {
    cache[detail] = (
      detail === '50m'
        ? import('world-atlas/countries-50m.json')
        : import('world-atlas/countries-10m.json')
    ).then((m) => m.default)
  }
  return cache[detail]
}

export async function loadMapData(key) {
  const def = MAPS[key]
  const topo = await loadTopo(def.detail)
  const geoms = topo.objects.countries.geometries

  // Kosovo je uvek u sastavu Srbije
  let feats
  const sr = geoms.find((g) => g.properties && g.properties.name === 'Serbia')
  const ks = geoms.find((g) => g.properties && g.properties.name === 'Kosovo')
  if (sr && ks) {
    const rest = geoms.filter((g) => g !== sr && g !== ks).map((g) => feature(topo, g))
    const merged = {
      type: 'Feature',
      properties: { name: 'Serbia' },
      geometry: merge(topo, [sr, ks]),
    }
    feats = [...rest, merged]
  } else {
    feats = geoms.map((g) => feature(topo, g))
  }

  let projection
  let mapWidth
  if (key === 'svet') {
    projection = geoNaturalEarth1().fitExtent(
      [
        [PAD, PAD],
        [W - PAD, H - PAD],
      ],
      { type: 'Sphere' },
    )
    mapWidth = Math.abs(projection([180, 0])[0] - projection([-180, 0])[0])
  } else {
    const [w, s, e, n] = def.bbox
    projection = geoMercator().fitExtent(
      [
        [PAD, PAD],
        [W - PAD, H - PAD],
      ],
      {
        type: 'MultiPoint',
        coordinates: [
          [w, s],
          [e, n],
        ],
      },
    )
    projection.clipExtent([
      [-60, -60],
      [W + 60, H + 60],
    ])
    mapWidth = Math.abs(projection([e, s])[0] - projection([w, s])[0])
  }

  const path = geoPath(projection)
  const shapes = feats
    .map((f, k) => ({ k, d: path(f) }))
    .filter((s) => s.d)

  const riversData = (
    key === 'svet' ? await import('./data/rivers-world.json') : await import('./data/rivers-region.json')
  ).default
  const rivers = path(riversData) || ''

  let ap = ''
  if (key !== 'svet') {
    ap = path((await import('./data/borders-ap.json')).default) || ''
  }

  return { projection, mapWidth, shapes, rivers, ap }
}
