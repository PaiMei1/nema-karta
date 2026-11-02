import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const csvDir = path.join(root, 'csv')

const listCsv = () =>
  fs
    .readdirSync(csvDir)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b))

// Dev: služi folder csv/ na /csv/. Build: kopira csv/ u sajt zajedno sa spiskom (csv/index.json).
function csvFolder() {
  return {
    name: 'csv-folder',
    configureServer(server) {
      fs.mkdirSync(csvDir, { recursive: true })
      server.middlewares.use('/csv', (req, res) => {
        res.setHeader('Cache-Control', 'no-store')
        const url = decodeURIComponent((req.url || '/').split('?')[0])
        if (url === '/' || url === '/index.json') {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(listCsv()))
          return
        }
        const name = path.basename(url)
        const file = path.join(csvDir, name)
        if (!name.toLowerCase().endsWith('.csv') || !fs.existsSync(file)) {
          res.statusCode = 404
          res.end('Nema fajla')
          return
        }
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.end(fs.readFileSync(file))
      })
    },
    generateBundle() {
      if (!fs.existsSync(csvDir)) return
      const list = listCsv()
      this.emitFile({ type: 'asset', fileName: 'csv/index.json', source: JSON.stringify(list) })
      for (const name of list) {
        this.emitFile({ type: 'asset', fileName: 'csv/' + name, source: fs.readFileSync(path.join(csvDir, name)) })
      }
    },
  }
}

// Na GitHub Actions-u se putanja (ime repozitorijuma) uzima automatski
const repo = process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[1] : ''

export default defineConfig(({ command }) => ({
  base: command === 'build' && repo ? `/${repo}/` : '/',
  plugins: [react(), csvFolder()],
}))
