import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dist = join(root, 'dist')
let html = await readFile(join(dist, 'index.html'), 'utf8')
const scripts = [...html.matchAll(/<script type="module" crossorigin src="\/assets\/([^"]+\.js)"><\/script>/g)]
const styles = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\/assets\/([^"]+\.css)">/g)]
if (scripts.length !== 1 || styles.length !== 1) {
  throw new Error('Expected exactly one JavaScript bundle and one stylesheet in the Vite output.')
}
const script = scripts[0]
const style = styles[0]
const js = await readFile(join(dist, 'assets', script[1]), 'utf8')
const css = await readFile(join(dist, 'assets', style[1]), 'utf8')
html = html.replace(script[0], () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
html = html.replace(style[0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`)
html = html.replace('<head>', '<head>\n    <meta name="rochecommander-standalone" content="editor">')
html = html.replace('<title>Bookmark Commander</title>', '<title>Bookmark Commander Editor</title>')
await writeFile(join(root, 'BookMarkCommander_Editor.html'), html, 'utf8')
console.log('Created BookMarkCommander_Editor.html')
