import { useEffect, useRef, useState } from 'react'
import { toPoints } from './csv.js'
import { REPORT_ENDPOINT } from './config.js'

const LOCAL = '__local__'

const loadName = () => {
  try {
    return localStorage.getItem('nk-ime') || ''
  } catch {
    return ''
  }
}

export default function Report({ files, initial, localPoints, onClose }) {
  const [type, setType] = useState(initial?.type || 'point')
  const [csv, setCsv] = useState(initial?.csv || (localPoints ? LOCAL : files[0] || ''))
  const [points, setPoints] = useState([])
  const [pointIdx, setPointIdx] = useState('')
  const [name, setName] = useState(loadName)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('') // '' | sending | ok
  const [err, setErr] = useState('')
  const wanted = useRef(initial?.pointName || null)

  useEffect(() => {
    let off = false
    const apply = (pts) => {
      if (off) return
      setPoints(pts)
      const i = wanted.current ? pts.findIndex((p) => p.name === wanted.current) : -1
      wanted.current = null
      setPointIdx(i >= 0 ? String(i) : '')
    }
    if (!csv) return apply([])
    if (csv === LOCAL) return apply(localPoints || [])
    fetch(`${import.meta.env.BASE_URL}csv/${encodeURIComponent(csv)}`)
      .then((r) => r.text())
      .then((t) => apply(toPoints(t).points))
      .catch(() => apply([]))
    return () => {
      off = true
    }
  }, [csv])

  const valid = name.trim() && text.trim() && (type === 'point' ? csv && pointIdx !== '' : true)

  const send = async () => {
    setErr('')
    if (!REPORT_ENDPOINT) {
      setErr('Slanje nije podešeno. Upiši Formspree adresu u src/config.js.')
      return
    }
    try {
      localStorage.setItem('nk-ime', name.trim())
    } catch {}
    const p = type === 'point' ? points[Number(pointIdx)] : null
    const payload =
      type === 'point'
        ? {
            _subject: `Nema karta: problem sa tačkom "${p.name}" (${name.trim()})`,
            tip: 'Problem sa tačkom',
            ime: name.trim(),
            csv: csv === LOCAL ? '(ručno učitan CSV)' : csv,
            toponim: p.name,
            lat: p.lat,
            lon: p.lon,
            opis: text.trim(),
          }
        : {
            _subject: `Nema karta: prijava od ${name.trim()}`,
            tip: 'Ostalo',
            ime: name.trim(),
            opis: text.trim(),
          }
    setStatus('sending')
    try {
      const r = await fetch(REPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error(`Greška ${r.status}`)
      setStatus('ok')
    } catch (e) {
      setStatus('')
      setErr('Slanje nije uspelo: ' + e.message)
    }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Prijavi grešku</h2>

        {status === 'ok' ? (
          <>
            <div className="fb ok">Hvala! Prijava je poslata.</div>
            <button className="primary" onClick={onClose}>
              Zatvori
            </button>
          </>
        ) : (
          <>
            <label>
              Vrsta problema
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="point">Problem sa tačkom</option>
                <option value="other">Ostalo</option>
              </select>
            </label>

            {type === 'point' && (
              <>
                <div className="note">
                  Koordinate u CSV-u (naročito ako ih je pravio LLM) mogu biti netačne. Prijavi tačku
                  ako je na pogrešnom mestu ili je naziv pogrešan.
                </div>
                <label>
                  CSV fajl
                  <select value={csv} onChange={(e) => setCsv(e.target.value)}>
                    <option value="">— izaberi —</option>
                    {localPoints && <option value={LOCAL}>(ručno učitan CSV)</option>}
                    {files.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tačka
                  <select value={pointIdx} onChange={(e) => setPointIdx(e.target.value)}>
                    <option value="">— izaberi —</option>
                    {points.map((p, i) => (
                      <option key={i} value={i}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label>
              Tvoje ime
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label>
              Opis problema
              <textarea rows="4" value={text} onChange={(e) => setText(e.target.value)} />
            </label>

            {err && <div className="error">{err}</div>}

            <div className="row">
              <button className="danger" disabled={!valid || status === 'sending'} onClick={send}>
                {status === 'sending' ? 'Šaljem…' : 'Pošalji'}
              </button>
              <button onClick={onClose}>Otkaži</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
