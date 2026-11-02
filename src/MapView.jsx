import { memo, useEffect, useRef, useState } from 'react'
import { W, H } from './maps.js'

// Boje prošlih tačaka (različite od plave, zelene, crvene, reka i granica)
const DONE_OK = '#1f2937'
const DONE_BAD = '#f97316'

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
  const [t, setT] = useState({ k: 1, x: 0, y: 0 })

  const toSvg = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    const s = W / r.width
    return { sx: (e.clientX - r.left) * s, sy: (e.clientY - r.top) * s, s }
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
    drag.current = { sx: e.clientX, sy: e.clientY, tx: t.x, ty: t.y, moved: false }
  }

  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true
    if (d.moved) {
      const { s } = toSvg(e)
      setT(clampT({ k: t.k, x: d.tx + dx * s, y: d.ty + dy * s }))
    }
  }

  const onPointerUp = (e) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved || locked) return
    const { sx, sy, s } = toSvg(e)
    const bx = (sx - t.x) / t.k
    const by = (sy - t.y) / t.k
    if (showPoints) {
      const hitR = (14 * s) / t.k
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

  const r = 5 / t.k
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
