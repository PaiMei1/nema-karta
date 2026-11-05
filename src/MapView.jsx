import { memo, useEffect, useRef, useState } from 'react'
import { W, H } from './maps.js'

// Boje prošlih tačaka (različite od plave, zelene, crvene, reka i granica)
const DONE_OK = '#1f2937'
const DONE_BAD = '#f97316'

// Ekran na dodir (telefon): veće tačke i veća zona dodira
const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

const clampT = (t) => ({
  k: t.k,
  x: Math.min(0, Math.max(W * (1 - t.k), t.x)),
  y: Math.min(0, Math.max(H * (1 - t.k), t.y)),
})

const Land = memo(function Land({ shapes, rivers, ap }) {
  return (
    <g>
      {shapes.map((s) => (
        <path
          key={s.k}
          d={s.d}
          fill="#ece8da"
          stroke="#8c8c8c"
          strokeWidth="0.6"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {rivers && (
        <path
          d={rivers}
          fill="none"
          stroke="#6aaed6"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {ap && (
        <path
          d={ap}
          fill="none"
          stroke="#7a5c8e"
          strokeWidth="1.2"
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  )
})

export default function MapView({
  shapes,
  rivers,
  ap,
  points,
  showPoints,
  labels,
  target,
  answer,
  tolerance,
  hiddenMode,
  locked,
  done = {},
  onPick,
}) {
  const svgRef = useRef(null)
  const drag = useRef(null)
  const pointers = useRef(new Map())
  const pinch = useRef(null)
  const [t, setT] = useState({ k: 1, x: 0, y: 0 })

  // Pretvara ekranske koordinate u koordinate mape (radi i kad mapa ima prazne trake sa strane)
  const toSvg = (e) => {
    const m = svgRef.current.getScreenCTM()
    const s = 1 / m.a
    return { sx: (e.clientX - m.e) * s, sy: (e.clientY - m.f) * s, s }
  }

  const zoomAt = (sx, sy, factor) =>
    setT((p) => {
      const k = Math.min(40, Math.max(1, p.k * factor))
      const r = k / p.k
      return clampT({ k, x: sx - (sx - p.x) * r, y: sy - (sy - p.y) * r })
    })

  useEffect(() => {
    const el = svgRef.current
    const h = (e) => {
      e.preventDefault()
      const { sx, sy } = toSvg(e)
      zoomAt(sx, sy, e.deltaY < 0 ? 1.25 : 0.8)
    }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])

  const onPointerDown = (e) => {
    svgRef.current.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      }
      drag.current = null
    } else if (pointers.current.size === 1) {
      drag.current = { sx: e.clientX, sy: e.clientY, tx: t.x, ty: t.y, moved: false, type: e.pointerType }
    }
  }

  const onPointerMove = (e) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }

    // Zumiranje sa dva prsta (pinch) + pomeranje
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const prev = pinch.current
      const p0 = toSvg({ clientX: prev.cx, clientY: prev.cy })
      const p1 = toSvg({ clientX: cx, clientY: cy })
      const factor = dist / prev.dist
      setT((p) => {
        const k = Math.min(40, Math.max(1, p.k * factor))
        const r = k / p.k
        return clampT({
          k,
          x: p0.sx - (p0.sx - p.x) * r + (p1.sx - p0.sx),
          y: p0.sy - (p0.sy - p.y) * r + (p1.sy - p0.sy),
        })
      })
      pinch.current = { dist, cx, cy }
      return
    }

    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    const threshold = d.type === 'touch' ? 10 : 4
    if (!d.moved && Math.hypot(dx, dy) > threshold) d.moved = true
    if (d.moved) {
      const { s } = toSvg(e)
      setT(clampT({ k: t.k, x: d.tx + dx * s, y: d.ty + dy * s }))
    }
  }

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId)
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null
      drag.current = null
      return
    }
    const d = drag.current
    drag.current = null
    if (!d || d.moved || locked) return
    const { sx, sy, s } = toSvg(e)
    const bx = (sx - t.x) / t.k
    const by = (sy - t.y) / t.k
    if (showPoints) {
      const hitR = ((d.type === 'touch' ? 26 : 14) * s) / t.k
      let best = null
      let bestD = Infinity
      for (const p of points) {
        const dist = Math.hypot(p.x - bx, p.y - by)
        if (dist < bestD) {
          bestD = dist
          best = p
        }
      }
      if (best && bestD <= hitR) onPick({ type: 'point', id: best.id })
    } else {
      onPick({ type: 'spot', x: bx, y: by })
    }
  }

  const onPointerCancel = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    drag.current = null
  }

  const r = (coarse ? 7 : 5) / t.k
  const sw = 1.5 / t.k

  const pointFill = (p) => {
    if (answer && p.id === answer.pickedId && !answer.correct) return '#dc2626'
    if (p.id in done) return done[p.id] ? DONE_OK : DONE_BAD
    return '#2563eb'
  }

  return (
    <div className="mapwrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', aspectRatio: `${W}/${H}`, touchAction: 'none', cursor: locked ? 'grab' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <rect x="0" y="0" width={W} height={H} fill="#cfe4f2" />
        <g transform={`translate(${t.x} ${t.y}) scale(${t.k})`}>
          <Land shapes={shapes} rivers={rivers} ap={ap} />

          {answer && hiddenMode && target && (
            <circle
              cx={target.x}
              cy={target.y}
              r={tolerance}
              fill="rgba(22,163,74,0.12)"
              stroke="#16a34a"
              strokeWidth={sw}
              strokeDasharray={`${4 / t.k} ${3 / t.k}`}
            />
          )}

          {answer && answer.clicked && target && (
            <line
              x1={answer.clicked.x}
              y1={answer.clicked.y}
              x2={target.x}
              y2={target.y}
              stroke="#dc2626"
              strokeWidth={sw}
              strokeDasharray={`${4 / t.k} ${3 / t.k}`}
            />
          )}

          {showPoints &&
            points.map((p) => (
              <g key={p.id}>
                <circle cx={p.x} cy={p.y} r={r} fill={pointFill(p)} stroke="#fff" strokeWidth={sw} />
                {labels && (
                  <text
                    x={p.x + 7 / t.k}
                    y={p.y + 4 / t.k}
                    fontSize={12 / t.k}
                    fill="#111"
                    stroke="#fff"
                    strokeWidth={3 / t.k}
                    paintOrder="stroke"
                  >
                    {p.name}
                  </text>
                )}
              </g>
            ))}

          {answer && target && (
            <g>
              <circle cx={target.x} cy={target.y} r={r * 1.4} fill="#16a34a" stroke="#fff" strokeWidth={sw} />
              <text
                x={target.x + 9 / t.k}
                y={target.y + 4 / t.k}
                fontSize={13 / t.k}
                fontWeight="700"
                fill="#111"
                stroke="#fff"
                strokeWidth={3 / t.k}
                paintOrder="stroke"
              >
                {target.name}
              </text>
            </g>
          )}

          {answer && answer.clicked && (
            <circle
              cx={answer.clicked.x}
              cy={answer.clicked.y}
              r={r}
              fill={answer.correct ? '#16a34a' : '#dc2626'}
              stroke="#fff"
              strokeWidth={sw}
            />
          )}
        </g>
      </svg>

      {showPoints && !labels && (
        <div className="legend">
          <span><i style={{ background: '#2563eb' }} />preostalo</span>
          <span><i style={{ background: DONE_OK }} />tačno</span>
          <span><i style={{ background: DONE_BAD }} />netačno</span>
        </div>
      )}

      <div className="zoom">
        <button onClick={() => zoomAt(W / 2, H / 2, 1.5)}>+</button>
        <button onClick={() => zoomAt(W / 2, H / 2, 1 / 1.5)}>−</button>
        <button onClick={() => setT({ k: 1, x: 0, y: 0 })}>⟲</button>
      </div>
    </div>
  )
}
