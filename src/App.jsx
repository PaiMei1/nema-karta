import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapView from './MapView.jsx'
import Report from './Report.jsx'
import { MAPS, W, H, loadMapData, guessMap } from './maps.js'
import { toPoints } from './csv.js'

const shuffle = (a) => {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

export default function App() {
  const [files, setFiles] = useState([])
  const [file, setFile] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')

  const [mapChoice, setMapChoice] = useState('auto')
  const [mode, setMode] = useState('visible')
  const [tolPct, setTolPct] = useState(5)
  const [count, setCount] = useState(0)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [mapData, setMapData] = useState(null)

  const [phase, setPhase] = useState('setup') // setup | preview | play | end
  const [queue, setQueue] = useState([])
  const [idx, setIdx] = useState(0)
  const [answer, setAnswer] = useState(null)
  const [results, setResults] = useState([])
  const [report, setReport] = useState(null)

  const firstLoad = useRef(true)

  const chooseFile = (f) => {
    setFile(f)
    setRangeFrom('')
    setRangeTo('')
  }

  const refreshFiles = useCallback(async () => {
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}csv/index.json`)
      const list = await r.json()
      setFiles(list)
      if (firstLoad.current) {
        firstLoad.current = false
        if (list.length) setFile(list[0])
      }
    } catch {
      setError('Ne mogu da pročitam folder csv/. Pokreni projekat komandom: npm run dev')
    }
  }, [])

  useEffect(() => {
    refreshFiles()
    window.addEventListener('focus', refreshFiles)
    return () => window.removeEventListener('focus', refreshFiles)
  }, [refreshFiles])

  useEffect(() => {
    if (!file) return
    fetch(`${import.meta.env.BASE_URL}csv/${encodeURIComponent(file)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Fajl nije pronađen.')
        return r.text()
      })
      .then((t) => {
        setParsed(toPoints(t))
        setError('')
      })
      .catch((e) => {
        setParsed(null)
        setError(e.message)
      })
  }, [file, reloadKey])

  const onUpload = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    try {
      setParsed(toPoints(await f.text()))
      chooseFile('')
      setError('')
    } catch (er) {
      setError(er.message)
    }
    e.target.value = ''
  }

  const resolvedMap =
    mapChoice !== 'auto' ? mapChoice : parsed ? parsed.mapa || guessMap(parsed.points) : 'srbija'

  useEffect(() => {
    let off = false
    setMapData(null)
    loadMapData(resolvedMap)
      .then((d) => {
        if (!off) setMapData(d)
      })
      .catch(() =>
        setError('Nedostaju podaci o rekama/granicama. Pokreni u terminalu: npm run data'),
      )
    return () => {
      off = true
    }
  }, [resolvedMap])

  const projected = useMemo(() => {
    if (!parsed || !mapData) return { inside: [], outside: [] }
    const inside = []
    const outside = []
    for (const p of parsed.points) {
      const xy = mapData.projection([p.lon, p.lat])
      const q = xy ? { ...p, x: xy[0], y: xy[1] } : null
      if (q && q.x >= 0 && q.x <= W && q.y >= 0 && q.y <= H) inside.push(q)
      else outside.push(p)
    }
    return { inside, outside }
  }, [parsed, mapData])

  // Tačke koje ulaze u igru: opseg po rednom broju u CSV-u (od–do)
  const total = parsed ? parsed.points.length : 0
  const from = Math.max(1, parseInt(rangeFrom, 10) || 1)
  const to = parseInt(rangeTo, 10) || Infinity
  const pool = useMemo(
    () => projected.inside.filter((p) => p.id + 1 >= from && p.id + 1 <= to),
    [projected, from, to],
  )
  const previewPoints = useMemo(
    () => projected.inside.map((p) => ({ ...p, name: `${p.id + 1}. ${p.name}` })),
    [projected],
  )
  const playCount = count > 0 ? Math.min(count, pool.length) : pool.length

  const target = phase === 'play' ? queue[idx] : null
  const tolBase = mapData ? (tolPct / 100) * mapData.mapWidth : 0

  // Svaki put novi nasumičan redosled; na mapi se vide samo tačke koje se igraju (queue)
  const startGame = (pts) => {
    let q = shuffle(pts)
    if (count > 0) q = q.slice(0, count)
    setQueue(q)
    setIdx(0)
    setAnswer(null)
    setResults([])
    setPhase('play')
  }

  const onPick = (info) => {
    if (answer || !target) return
    let a
    if (info.type === 'point') {
      a = { correct: info.id === target.id, pickedId: info.id, clicked: null }
    } else {
      const dist = Math.hypot(info.x - target.x, info.y - target.y)
      a = { correct: dist <= tolBase, pickedId: null, clicked: { x: info.x, y: info.y }, dist }
    }
    setAnswer(a)
    setResults((r) => [...r, { point: target, correct: a.correct }])
  }

  const next = () => {
    if (idx + 1 >= queue.length) setPhase('end')
    else {
      setIdx(idx + 1)
      setAnswer(null)
    }
  }

  useEffect(() => {
    const h = (e) => {
      if (phase === 'play' && answer && !report && e.key === 'Enter') {
        e.preventDefault()
        next()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  const correctN = results.filter((r) => r.correct).length
  const pct = results.length ? Math.round((100 * correctN) / results.length) : 0
  const misses = results.filter((r) => !r.correct)
  const canStart = mapData && pool.length > 0
  const done = Object.fromEntries(results.map((r) => [r.point.id, r.correct]))

  return (
    <div className={'app phase-' + phase}>
      <h1>Nema karta</h1>

      {error && <div className="error">{error}</div>}

      {phase === 'setup' && (
        <div className="panel">
          <div className="row">
            <label>
              CSV iz foldera csv/
              <select value={file} onChange={(e) => chooseFile(e.target.value)}>
                <option value="">— izaberi —</option>
                {files.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => {
                refreshFiles()
                setReloadKey((k) => k + 1)
              }}
            >
              Osveži
            </button>
            <label className="btn">
              Učitaj CSV…
              <input type="file" accept=".csv,text/csv" hidden onChange={onUpload} />
            </label>
          </div>

          {parsed && (
            <div className="info">
              Učitano toponima: <b>{parsed.points.length}</b>
              {parsed.skipped.length > 0 && (
                <> · preskočeno zbog neispravnih koordinata: <b>{parsed.skipped.join(', ')}</b></>
              )}
              {mapData && projected.outside.length > 0 && (
                <> · van izabrane mape: <b>{projected.outside.map((p) => p.name).join(', ')}</b></>
              )}
            </div>
          )}

          <div className="row">
            <label>
              Mapa
              <select value={mapChoice} onChange={(e) => setMapChoice(e.target.value)}>
                <option value="auto">Auto ({MAPS[resolvedMap].label})</option>
                {Object.entries(MAPS).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="row">
            <label className="check">
              <input type="radio" checked={mode === 'visible'} onChange={() => setMode('visible')} />
              Sa tačkama (klikni tačku)
            </label>
            <label className="check">
              <input type="radio" checked={mode === 'hidden'} onChange={() => setMode('hidden')} />
              Bez tačaka (pogodi mesto)
            </label>
          </div>

          {mode === 'hidden' && (
            <div className="row">
              <label>
                Tolerancija: <b>{tolPct}%</b> širine mape
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="0.5"
                  value={tolPct}
                  onChange={(e) => setTolPct(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          <div className="row">
            <label>
              Od tačke br.
              <input
                type="number"
                inputMode="numeric"
                min="1"
                placeholder="1"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
            </label>
            <label>
              Do tačke br.
              <input
                type="number"
                inputMode="numeric"
                min="1"
                placeholder={String(total || '')}
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
              />
            </label>
            <label>
              Broj pitanja (0 = sva)
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={count}
                onChange={(e) => setCount(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
          </div>

          {parsed && (
            <div className="info">
              Igra se <b>{playCount}</b> od {pool.length} tačaka u izabranom opsegu, nasumičnim
              redosledom. Redni brojevi se vide u "Pregledu tačaka".
            </div>
          )}

          <div className="row">
            <button disabled={!canStart} onClick={() => setPhase('preview')}>
              Pregled tačaka
            </button>
            <button className="primary" disabled={!canStart} onClick={() => startGame(pool)}>
              Start
            </button>
            <button className="danger" onClick={() => setReport({ type: 'point', csv: file })}>
              Prijavi grešku
            </button>
          </div>
          <div className="note">
            Koordinate u CSV-u (naročito ako ih je napravio LLM) mogu biti netačne. Ako ti neka
            tačka deluje pogrešno, prijavi je.
          </div>
          {!mapData && <div className="info">Učitavam mapu…</div>}
        </div>
      )}

      {phase === 'preview' && (
        <div className="bar">
          <div className="q">Pregled svih tačaka iz CSV-a</div>
          <button onClick={() => setPhase('setup')}>Nazad</button>
        </div>
      )}

      {phase === 'play' && target && (
        <div className="topstack">
          <div className="bar">
            <div className="q">
              Pronađi: <b>{target.name}</b>
            </div>
            <div className="meta">
              {idx + 1}/{queue.length} · tačno {correctN}
            </div>
            <button
              className="danger"
              onClick={() => setReport({ type: 'point', csv: file, pointName: target.name })}
            >
              Prijavi tačku
            </button>
            <button onClick={() => setPhase('setup')}>Prekini</button>
          </div>
          {answer && (
            <div className={'fb ' + (answer.correct ? 'ok' : 'bad')}>
              <div className="fbtext">
                <span>
                  {answer.correct
                    ? '✔ Tačno!'
                    : mode === 'hidden'
                      ? `✘ Netačno — promašaj ${((answer.dist / mapData.mapWidth) * 100).toFixed(1)}% širine mape (dozvoljeno ${tolPct}%)`
                      : '✘ Netačno — tačna tačka je označena zeleno'}
                </span>
                {!answer.correct && (
                  <small>
                    Moguće je da je tačka u CSV-u pogrešna. Ako misliš da jeste, prijavi je.
                  </small>
                )}
              </div>
              <button className="primary" onClick={next}>
                {idx + 1 >= queue.length ? 'Završi' : 'Sledeće'} (Enter)
              </button>
            </div>
          )}
        </div>
      )}

      {(phase === 'preview' || phase === 'play') && (
        <div className="note rotate-hint">Za bolji prikaz okreni telefon u horizontalni položaj.</div>
      )}

      {(phase === 'preview' || phase === 'play') && mapData && (
        <MapView
          key={resolvedMap}
          shapes={mapData.shapes}
          rivers={mapData.rivers}
          ap={mapData.ap}
          points={phase === 'preview' ? previewPoints : queue}
          showPoints={phase === 'preview' || mode === 'visible'}
          labels={phase === 'preview'}
          target={target}
          answer={answer}
          tolerance={tolBase}
          hiddenMode={mode === 'hidden'}
          locked={phase === 'preview' || !!answer}
          done={done}
          onPick={onPick}
        />
      )}

      {phase === 'end' && (
        <div className="panel result">
          <div className="big">{pct}%</div>
          <div>
            Tačno {correctN} od {results.length}
          </div>
          {misses.length > 0 && (
            <>
              <h3>Promašeni toponimi</h3>
              <ul>
                {misses.map((m, i) => (
                  <li key={i}>{m.point.name}</li>
                ))}
              </ul>
            </>
          )}
          <div className="row">
            <button className="primary" onClick={() => startGame(pool)}>
              Igraj ponovo
            </button>
            {misses.length > 0 && (
              <button
                onClick={() => {
                  const missed = misses.map((m) => m.point)
                  setQueue(shuffle(missed))
                  setIdx(0)
                  setAnswer(null)
                  setResults([])
                  setPhase('play')
                }}
              >
                Samo promašene
              </button>
            )}
            <button onClick={() => setPhase('setup')}>Podešavanja</button>
          </div>
        </div>
      )}

      {report && (
        <Report
          files={files}
          initial={report}
          localPoints={file === '' && parsed ? parsed.points : null}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  )
}
