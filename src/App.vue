<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, type CSSProperties } from 'vue'

type Theme = 'light' | 'dark' | 'system'
const fontOptions = [
  { value: 'default', label: 'Default' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Trebuchet MS', label: 'Trebuchet MS' },
  { value: 'Courier New', label: 'Courier New' },
] as const
type FontFamily = typeof fontOptions[number]['value']
type Bookmark = {
  id: string
  title: string
  url: string
  categoryId: string | null
  image: string | null
  lastUsed: number | null
}
type Category = { id: string; name: string }
type QuickLink = { id: string; title: string; url: string }
type Data = {
  bookmarks: Bookmark[]
  categories: Category[]
  quickLinks: QuickLink[]
  theme: Theme
  sort: 'name' | 'recent'
  backgroundColor?: string
  fontFamily?: FontFamily
  fontSize?: number
}
type Dialog = 'bookmark' | 'category' | 'quick' | null
type SidebarContextMenu = { x: number; y: number; categoryId: string | null }
type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string
    types: { description: string; accept: Record<string, string[]> }[]
  }) => Promise<FileSystemFileHandle>
}

const defaultBackgroundColor = '#faf9f5'
const defaultDarkBackgroundColor = '#202a27'
const defaultFontSize = 16
const appVersion = __APP_VERSION__

const publishedData = document.getElementById('rochecommander-data')
const published = publishedData !== null
const data = ref<Data>({ bookmarks: [], categories: [], quickLinks: [], theme: 'system', sort: 'name', fontFamily: 'default', fontSize: defaultFontSize })
const error = ref('')
const dirty = ref(false)
const exportRequested = ref(false)
const publishRequested = ref(false)
const search = ref('')
const selection = ref('all')
const settingsOpen = ref(false)
const helpMenuOpen = ref(false)
const infoDialog = ref<'help' | 'about' | null>(null)
const dragging = ref(false)
const sidebarContextMenu = ref<SidebarContextMenu | null>(null)
const highlightedBookmarkId = ref<string | null>(null)
const publishedCardSize = ref(300)
const publishedBookmarkView = ref<'cards' | 'list'>('cards')
const collapsedSidebarCategoryIds = ref(new Set<string>())
const collapsedCategorySectionIds = ref(new Set<string>())
const effectiveDark = ref(false)
const currentDateTime = ref(new Date())
const dialog = ref<Dialog>(null)
const editingId = ref<string | null>(null)
const settingsContainer = ref<HTMLElement | null>(null)
const helpContainer = ref<HTMLElement | null>(null)
const helpButton = ref<HTMLButtonElement | null>(null)
const infoCloseButton = ref<HTMLButtonElement | null>(null)
const formTitle = ref('')
const formUrl = ref('')
const formCategory = ref('')
const formImage = ref<string | null>(null)
const readingImage = ref(false)
const formError = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
let dragDepth = 0
let media: MediaQueryList
let highlightTimeout: number | undefined
let clockInterval: number | undefined

const selectedBackgroundColor = computed(() => data.value.backgroundColor ?? (effectiveDark.value ? defaultDarkBackgroundColor : defaultBackgroundColor))
const currentDateTimeLabel = computed(() => {
  const date = currentDateTime.value
  const dateLabel = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const hour = date.getHours() % 12 || 12
  const timeLabel = `${hour}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
  return `${dateLabel}. ${timeLabel}`
})
const appearanceStyle = computed<CSSProperties>(() => {
  const styles: CSSProperties = {
    '--custom-font-size': `${data.value.fontSize ?? defaultFontSize}px`,
    '--bookmark-card-width': `${publishedCardSize.value}px`,
  }
  if (data.value.backgroundColor) styles['--custom-background'] = data.value.backgroundColor
  const font = fontOptions.find((option) => option.value === (data.value.fontFamily ?? 'default'))?.value
  if (font && font !== 'default') {
    styles['--custom-font-family'] = font === 'Trebuchet MS' || font === 'Courier New' ? `'${font}'` : font
  }
  return styles
})

function save(next: Data) {
  error.value = ''
  data.value = next
  dirty.value = true
  exportRequested.value = false
  publishRequested.value = false
  applyTheme()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200
}

function isFontFamily(value: unknown): value is FontFamily {
  return fontOptions.some((option) => option.value === value)
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
}

function isUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 8192) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
  } catch {
    return false
  }
}

function isData(value: unknown): value is Data {
  if (!isRecord(value) || !Array.isArray(value.categories) || !Array.isArray(value.bookmarks) || !Array.isArray(value.quickLinks)) return false
  if (typeof value.theme !== 'string' || !['light', 'dark', 'system'].includes(value.theme) ||
    typeof value.sort !== 'string' || !['name', 'recent'].includes(value.sort)) return false
  if ((value.backgroundColor !== undefined && !isHexColor(value.backgroundColor)) ||
    (value.fontFamily !== undefined && !isFontFamily(value.fontFamily)) ||
    (value.fontSize !== undefined && (typeof value.fontSize !== 'number' || !Number.isInteger(value.fontSize) || value.fontSize < 12 || value.fontSize > 24))) return false
  if (!value.categories.every((item: unknown) => isRecord(item) && isText(item.id) && isText(item.name))) return false
  const categories = value.categories as Category[]
  const categoryIds = new Set(categories.map((item) => item.id))
  if (categoryIds.size !== categories.length || categoryIds.has('all') || categoryIds.has('unsorted')) return false
  if (!value.bookmarks.every((item: unknown) => isRecord(item) && isText(item.id) && isText(item.title) && isUrl(item.url) &&
    (item.categoryId === null || (typeof item.categoryId === 'string' && categoryIds.has(item.categoryId))) &&
    (item.image === null || (typeof item.image === 'string' && item.image.length <= 2_800_000 && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(item.image))) &&
    (item.lastUsed === null || (typeof item.lastUsed === 'number' && Number.isFinite(item.lastUsed) && item.lastUsed >= 0)))) return false
  if (!value.quickLinks.every((item: unknown) => isRecord(item) && isText(item.id) && isText(item.title) && isUrl(item.url))) return false
  const bookmarks = value.bookmarks as Bookmark[]
  const quickLinks = value.quickLinks as QuickLink[]
  return new Set(bookmarks.map((item) => item.id)).size === bookmarks.length &&
    new Set(quickLinks.map((item) => item.id)).size === quickLinks.length
}

function assignUncategorizedBookmarks(value: Data): { data: Data; migrated: boolean } {
  if (!value.bookmarks.some((bookmark) => !bookmark.categoryId)) return { data: value, migrated: false }
  const category = value.categories.find((item) => item.name.toLocaleLowerCase() === 'uncategorized')
  const categoryId = category?.id ?? crypto.randomUUID()
  const categories = category ? value.categories : [...value.categories, { id: categoryId, name: 'Uncategorized' }]
  return {
    data: {
      ...value,
      categories,
      bookmarks: value.bookmarks.map((bookmark) => bookmark.categoryId ? bookmark : { ...bookmark, categoryId }),
    },
    migrated: true,
  }
}

function openBookmarksFile() {
  settingsOpen.value = false
  importInput.value?.click()
}

async function importData(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const parsed: unknown = JSON.parse(await file.text())
    if (!isData(parsed)) throw new Error('This file is not a valid BookMark Commander bookmarks file.')
    if (dirty.value && !confirm('Opening a file will replace your unsaved changes. Continue?')) return
    const normalized = assignUncategorizedBookmarks({ ...parsed, sort: 'name' })
    data.value = normalized.data
    dirty.value = normalized.migrated
    exportRequested.value = false
    publishRequested.value = false
    selection.value = 'all'
    error.value = ''
    applyTheme()
  } catch (err) {
    error.value = err instanceof Error ? `Could not open bookmarks: ${err.message}` : 'Could not open the bookmarks file.'
  } finally {
    input.value = ''
  }
}

function download(contents: string, type: string, filename: string) {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function saveBookmarksFile() {
  settingsOpen.value = false
  try {
    const contents = JSON.stringify(data.value, null, 2)
    const savePicker = (window as SaveFilePickerWindow).showSaveFilePicker
    if (savePicker) {
      const file = await savePicker.call(window, {
        suggestedName: 'bookmarks.json',
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
      })
      const writable = await file.createWritable()
      await writable.write(contents)
      await writable.close()
      dirty.value = false
      exportRequested.value = false
    } else {
      download(contents, 'application/json', 'bookmarks.json')
      exportRequested.value = true
    }
    error.value = ''
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    error.value = err instanceof Error ? `Could not save bookmarks: ${err.message}` : 'Could not save the bookmarks file.'
  }
}

async function publish() {
  try {
    if (!document.querySelector('meta[name="rochecommander-standalone"]')) {
      throw new Error('Open BookMarkCommander_Editor.html to publish a self-contained page.')
    }
    const root = document.documentElement.cloneNode(true)
    if (!(root instanceof HTMLElement)) throw new Error('Could not prepare the published page.')
    const app = root.querySelector('#app')
    const head = root.querySelector('head')
    if (!app || !head) throw new Error('The generator page is missing required content.')
    app.replaceChildren()
    app.removeAttribute('data-v-app')
    root.removeAttribute('data-theme')
    const embedded = document.createElement('script')
    embedded.id = 'rochecommander-data'
    embedded.type = 'application/json'
    embedded.textContent = JSON.stringify(data.value).replace(/</g, '\\u003c')
    head.appendChild(embedded)
    const title = head.querySelector('title')
    if (title) title.textContent = 'BookMark Commander'
    const contents = `<!DOCTYPE html>\n${root.outerHTML}`
    const savePicker = (window as SaveFilePickerWindow).showSaveFilePicker
    if (savePicker) {
      const file = await savePicker.call(window, {
        suggestedName: 'BookMarkCommander.html',
        types: [{ description: 'HTML file', accept: { 'text/html': ['.html'] } }],
      })
      const writable = await file.createWritable()
      await writable.write(contents)
      await writable.close()
    } else {
      download(contents, 'text/html;charset=utf-8', 'BookMarkCommander.html')
    }
    publishRequested.value = true
    error.value = ''
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    error.value = err instanceof Error ? `Could not publish: ${err.message}` : 'Could not publish the page.'
  }
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}

function applyTheme() {
  if (!data.value) return
  const dark = data.value.theme === 'dark' || (data.value.theme === 'system' && media.matches)
  effectiveDark.value = dark
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

function cleanUrl(input: string): string {
  const value = input.trim()
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`)
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Enter a valid HTTP or HTTPS address without credentials.')
  }
  return url.href
}

function domain(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}

function favicon(url: string): string {
  return `${new URL(url).origin}/favicon.ico`
}

function openBookmark(bookmark?: Bookmark, url = '') {
  if (!data.value.categories.length) {
    error.value = 'Create a category before adding bookmarks.'
    return
  }
  const selectedCategory = data.value.categories.find((category) => category.id === selection.value)?.id ?? data.value.categories[0]?.id
  if (!selectedCategory) {
    error.value = 'Create a category before adding bookmarks.'
    return
  }
  editingId.value = bookmark?.id ?? null
  formTitle.value = bookmark?.title ?? (url ? domain(url) : '')
  formUrl.value = bookmark?.url ?? url
  formCategory.value = bookmark?.categoryId ?? selectedCategory
  formImage.value = bookmark?.image ?? null
  readingImage.value = false
  formError.value = ''
  dialog.value = 'bookmark'
}

function openQuick(link?: QuickLink) {
  editingId.value = link?.id ?? null
  formTitle.value = link?.title ?? ''
  formUrl.value = link?.url ?? ''
  formError.value = ''
  dialog.value = 'quick'
}

function openCategory(category?: Category) {
  editingId.value = category?.id ?? null
  formTitle.value = category?.name ?? ''
  formError.value = ''
  dialog.value = 'category'
}

function showAllCategories() {
  selection.value = 'all'
  search.value = ''
  highlightedBookmarkId.value = null
  if (highlightTimeout !== undefined) {
    window.clearTimeout(highlightTimeout)
    highlightTimeout = undefined
  }
}

function toggleSidebarCategory(categoryId: string) {
  const next = new Set(collapsedSidebarCategoryIds.value)
  if (next.has(categoryId)) next.delete(categoryId)
  else next.add(categoryId)
  collapsedSidebarCategoryIds.value = next
}

function expandAllSidebarCategories() {
  collapsedSidebarCategoryIds.value = new Set()
}

function collapseAllSidebarCategories() {
  collapsedSidebarCategoryIds.value = new Set(data.value.categories.map((category) => category.id))
}

function toggleCategorySection(categoryId: string) {
  const next = new Set(collapsedCategorySectionIds.value)
  if (next.has(categoryId)) next.delete(categoryId)
  else next.add(categoryId)
  collapsedCategorySectionIds.value = next
}

function expandCategorySection(categoryId: string) {
  if (!collapsedCategorySectionIds.value.has(categoryId)) return
  const next = new Set(collapsedCategorySectionIds.value)
  next.delete(categoryId)
  collapsedCategorySectionIds.value = next
}

function expandAllCategorySections() {
  collapsedCategorySectionIds.value = new Set()
}

function collapseAllCategorySections() {
  collapsedCategorySectionIds.value = new Set(data.value.categories.map((category) => category.id))
}

function handleSidebarClick(event: MouseEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('button')) return
  showAllCategories()
}

function showSidebarContextMenu(event: MouseEvent, categoryId: string | null = null) {
  event.preventDefault()
  if (published) return
  const width = 200
  const height = 88
  sidebarContextMenu.value = {
    x: Math.max(0, Math.min(event.clientX, window.innerWidth - width)),
    y: Math.max(0, Math.min(event.clientY, window.innerHeight - height)),
    categoryId,
  }
}

function addCategoryFromContextMenu() {
  sidebarContextMenu.value = null
  openCategory()
}

function addBookmarkFromContextMenu() {
  const categoryId = sidebarContextMenu.value?.categoryId
  sidebarContextMenu.value = null
  openBookmark()
  if (categoryId && dialog.value === 'bookmark') formCategory.value = categoryId
}

function focusBookmark(bookmark: Bookmark) {
  selection.value = bookmark.categoryId ?? 'all'
  if (bookmark.categoryId) expandCategorySection(bookmark.categoryId)
  search.value = ''
  nextTick(() => {
    const element = document.getElementById(`bookmark-${bookmark.id}`)
    if (!element) return
    highlightedBookmarkId.value = bookmark.id
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (highlightTimeout !== undefined) window.clearTimeout(highlightTimeout)
    highlightTimeout = window.setTimeout(() => {
      highlightedBookmarkId.value = null
      highlightTimeout = undefined
    }, 1800)
  })
}

function submit() {
  const title = formTitle.value.trim()
  if (!title) {
    formError.value = 'Please enter a name.'
    return
  }
  const next = JSON.parse(JSON.stringify(data.value)) as Data
  if (dialog.value === 'category') {
    if (next.categories.some((category) => category.name.toLocaleLowerCase() === title.toLocaleLowerCase() && category.id !== editingId.value)) {
      formError.value = 'A category with this name already exists.'
      return
    }
    const category = { id: editingId.value ?? crypto.randomUUID(), name: title }
    const index = next.categories.findIndex((item) => item.id === editingId.value)
    if (index >= 0) next.categories[index] = category
    else {
      next.categories.push(category)
      selection.value = 'all'
      search.value = ''
    }
  } else {
    let url: string
    try {
      url = cleanUrl(formUrl.value)
    } catch {
      formError.value = 'Enter a valid HTTP or HTTPS address without credentials.'
      return
    }
    if (dialog.value === 'bookmark') {
      if (!next.categories.some((category) => category.id === formCategory.value)) {
        formError.value = 'Choose a category before saving.'
        return
      }
      const previous = next.bookmarks.find((item) => item.id === editingId.value)
      const bookmark: Bookmark = {
        id: editingId.value ?? crypto.randomUUID(), title, url,
        categoryId: formCategory.value, image: formImage.value,
        lastUsed: previous?.lastUsed ?? null,
      }
      const index = next.bookmarks.findIndex((item) => item.id === editingId.value)
      if (index >= 0) next.bookmarks[index] = bookmark
      else {
        next.bookmarks.push(bookmark)
        selection.value = 'all'
        search.value = ''
      }
    } else if (dialog.value === 'quick') {
      const link = { id: editingId.value ?? crypto.randomUUID(), title, url }
      const index = next.quickLinks.findIndex((item) => item.id === editingId.value)
      if (index >= 0) next.quickLinks[index] = link
      else next.quickLinks.push(link)
    }
  }
  save(next)
  dialog.value = null
}

function removeBookmark(bookmark: Bookmark) {
  if (!data.value || !confirm(`Delete "${bookmark.title}"?`)) return
  save({ ...data.value, bookmarks: data.value.bookmarks.filter((item) => item.id !== bookmark.id) })
}

function removeCategory(category: Category) {
  if (!data.value) return
  if (data.value.bookmarks.some((bookmark) => bookmark.categoryId === category.id)) {
    error.value = `Move the bookmarks in "${category.name}" to another category before deleting it.`
    return
  }
  if (!confirm(`Delete "${category.name}"?`)) return
  save({
    ...data.value,
    categories: data.value.categories.filter((item) => item.id !== category.id),
  })
  if (selection.value === category.id) selection.value = 'all'
}

function removeQuick(link: QuickLink) {
  if (!data.value || !confirm(`Delete quick link "${link.title}"?`)) return
  save({ ...data.value, quickLinks: data.value.quickLinks.filter((item) => item.id !== link.id) })
}

function changeTheme(theme: Theme) {
  const next = { ...data.value, theme }
  if (published) {
    data.value = next
    applyTheme()
  } else {
    save(next)
  }
}

function updateAppearance(changes: Partial<Pick<Data, 'backgroundColor' | 'fontFamily' | 'fontSize'>>) {
  const next = { ...data.value, ...changes }
  error.value = ''
  if (published) data.value = next
  else save(next)
}

function changeBackgroundColor(event: Event) {
  const color = (event.target as HTMLInputElement).value
  if (!isHexColor(color)) {
    error.value = 'Choose a valid background color.'
    return
  }
  updateAppearance({ backgroundColor: color })
}

function resetBackgroundColor() {
  const next = { ...data.value }
  delete next.backgroundColor
  error.value = ''
  if (published) data.value = next
  else save(next)
}

function changeFontFamily(event: Event) {
  const fontFamily = (event.target as HTMLSelectElement).value
  if (!isFontFamily(fontFamily)) {
    error.value = 'Choose a supported font.'
    return
  }
  updateAppearance({ fontFamily })
}

function changeFontSize(event: Event) {
  const fontSize = Number((event.target as HTMLInputElement).value)
  if (!Number.isInteger(fontSize) || fontSize < 12 || fontSize > 24) {
    error.value = 'Choose a font size from 12 to 24 pixels.'
    return
  }
  updateAppearance({ fontSize })
}

function readImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    formError.value = 'Choose a PNG, JPEG, GIF, or WebP image no larger than 2 MB.'
    input.value = ''
    return
  }
  const reader = new FileReader()
  readingImage.value = true
  reader.onload = () => {
    if (typeof reader.result === 'string') formImage.value = reader.result
    readingImage.value = false
  }
  reader.onerror = () => { readingImage.value = false; formError.value = 'Could not read the image. Please try again.' }
  reader.readAsDataURL(file)
  formError.value = ''
}

const filtered = computed(() => {
  if (!data.value) return []
  const term = search.value.trim().toLocaleLowerCase()
  return data.value.bookmarks
    .filter((item) => (!term || `${item.title} ${item.url}`.toLocaleLowerCase().includes(term)) &&
      (selection.value === 'all' || item.categoryId === selection.value))
    .sort((a, b) => a.title.localeCompare(b.title))
})
const sections = computed(() => {
  if (!data.value) return []
  return data.value.categories
    .filter((section) => selection.value === 'all' || selection.value === section.id)
    .map((category) => ({ ...category, bookmarks: filtered.value.filter((bookmark) => bookmark.categoryId === category.id) }))
    .filter((section) => section.bookmarks.length > 0 || !search.value.trim())
})
const sidebarCategories = computed(() => data.value.categories.map((category) => ({
  ...category,
  bookmarks: data.value.bookmarks.filter((bookmark) => bookmark.categoryId === category.id),
})))

function isLinkDrag(event: DragEvent) {
  const types = event.dataTransfer?.types
  return types && (types.includes('text/uri-list') || types.includes('text/plain')) && !types.includes('Files')
}
function dragEnter(event: DragEvent) {
  if (!isLinkDrag(event)) return
  event.preventDefault()
  dragDepth++
  dragging.value = true
}
function dragOver(event: DragEvent) {
  if (isLinkDrag(event)) {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }
}
function dragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
function drop(event: DragEvent) {
  if (!isLinkDrag(event)) return
  event.preventDefault()
  dragDepth = 0
  dragging.value = false
  const uri = event.dataTransfer?.getData('text/uri-list').split(/\r?\n/).find((line) => line && !line.startsWith('#'))
    || event.dataTransfer?.getData('text/plain') || ''
  try {
    const url = cleanUrl(uri)
    if (dialog.value) {
      error.value = 'Finish your current action before adding a link.'
      return
    }
    openBookmark(undefined, url)
  } catch {
    error.value = 'That link is not a valid HTTP or HTTPS address.'
  }
}
function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    dialog.value = null
    settingsOpen.value = false
    helpMenuOpen.value = false
    if (infoDialog.value) closeInfoDialog()
    sidebarContextMenu.value = null
  }
}

function openInfoDialog(page: 'help' | 'about') {
  helpMenuOpen.value = false
  settingsOpen.value = false
  infoDialog.value = page
  nextTick(() => infoCloseButton.value?.focus())
}

function closeInfoDialog() {
  infoDialog.value = null
  nextTick(() => helpButton.value?.focus())
}

function closeMenusOnOutsideClick(event: MouseEvent) {
  if (!(event.target instanceof Node) || !settingsContainer.value || !settingsContainer.value.contains(event.target)) {
    settingsOpen.value = false
  }
  if (!(event.target instanceof Node) || !helpContainer.value || !helpContainer.value.contains(event.target)) {
    helpMenuOpen.value = false
  }
}

onMounted(() => {
  media = window.matchMedia('(prefers-color-scheme: dark)')
  if (published) {
    currentDateTime.value = new Date()
    clockInterval = window.setInterval(() => { currentDateTime.value = new Date() }, 1000)
  }
  if (publishedData) {
    try {
      const parsed: unknown = JSON.parse(publishedData.textContent || '')
      if (!isData(parsed)) throw new Error('The embedded bookmarks are invalid.')
      data.value = assignUncategorizedBookmarks({ ...parsed, sort: 'name' }).data
    } catch (err) {
      error.value = err instanceof Error ? `Could not load published bookmarks: ${err.message}` : 'Could not load published bookmarks.'
    }
  }
  media.addEventListener('change', applyTheme)
  if (!published) {
    window.addEventListener('dragenter', dragEnter)
    window.addEventListener('dragover', dragOver)
    window.addEventListener('dragleave', dragLeave)
    window.addEventListener('drop', drop)
  }
  document.addEventListener('click', closeMenusOnOutsideClick)
  window.addEventListener('keydown', closeOnEscape)
  window.addEventListener('beforeunload', beforeUnload)
  applyTheme()
})
onUnmounted(() => {
  media.removeEventListener('change', applyTheme)
  window.removeEventListener('dragenter', dragEnter)
  window.removeEventListener('dragover', dragOver)
  window.removeEventListener('dragleave', dragLeave)
  window.removeEventListener('drop', drop)
  document.removeEventListener('click', closeMenusOnOutsideClick)
  window.removeEventListener('keydown', closeOnEscape)
  window.removeEventListener('beforeunload', beforeUnload)
  if (highlightTimeout !== undefined) window.clearTimeout(highlightTimeout)
  if (clockInterval !== undefined) window.clearInterval(clockInterval)
})
</script>

<template>
  <div class="app-shell" :class="{ dragging, published }" :style="appearanceStyle" @click="sidebarContextMenu = null">
    <aside class="sidebar" @click="handleSidebarClick" @contextmenu="showSidebarContextMenu($event)">
      <div class="brand"><svg class="rudder" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="11.5" /><circle cx="18" cy="18" r="3" /><path d="M18 15V3M18 21v12M15 18H3M21 18h12M15.9 15.9 7.4 7.4M20.1 20.1l8.5 8.5M20.1 15.9l8.5-8.5M15.9 20.1l-8.5 8.5" /><circle cx="18" cy="2.5" r="1.5" /><circle cx="18" cy="33.5" r="1.5" /><circle cx="2.5" cy="18" r="1.5" /><circle cx="33.5" cy="18" r="1.5" /><circle cx="6.8" cy="6.8" r="1.5" /><circle cx="29.2" cy="29.2" r="1.5" /><circle cx="29.2" cy="6.8" r="1.5" /><circle cx="6.8" cy="29.2" r="1.5" /></svg><span>BookMark Commander</span></div>
      <nav aria-label="Bookmark categories">
        <div class="sidebar-heading">
          <span>Categories</span>
          <div class="category-disclosure-controls" role="group" aria-label="Sidebar category controls">
            <button class="category-control-button" aria-label="Expand all sidebar categories" title="Expand all" @click.stop="expandAllSidebarCategories"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 3.5 5 5 5-5M3 8l5 5 5-5" /></svg></button>
            <button class="category-control-button" aria-label="Collapse all sidebar categories" title="Collapse all" @click.stop="collapseAllSidebarCategories"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 7 5-5 5 5M3 12l5-5 5 5" /></svg></button>
          </div>
        </div>
        <template v-for="category in sidebarCategories" :key="category.id">
          <div class="sidebar-category-row">
            <button class="nav-item" :class="{ active: selection === category.id }" @click="selection = category.id; expandCategorySection(category.id)" @contextmenu.stop="showSidebarContextMenu($event, category.id)"><span>▱</span><span class="category-label">{{ category.name }}</span></button>
            <button v-if="category.bookmarks.length" class="sidebar-category-toggle" :aria-label="`${collapsedSidebarCategoryIds.has(category.id) ? 'Expand' : 'Collapse'} ${category.name}`" :aria-expanded="!collapsedSidebarCategoryIds.has(category.id)" @click.stop="toggleSidebarCategory(category.id)">
              <svg class="category-chevron" :class="{ collapsed: collapsedSidebarCategoryIds.has(category.id) }" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </button>
          </div>
          <div v-if="category.bookmarks.length && !collapsedSidebarCategoryIds.has(category.id)" class="bookmark-nav-list">
            <button v-for="bookmark in category.bookmarks" :key="bookmark.id" class="bookmark-nav-item" :class="{ active: highlightedBookmarkId === bookmark.id }" @click.stop="focusBookmark(bookmark)" @contextmenu.stop="showSidebarContextMenu($event, category.id)">{{ bookmark.title }}</button>
          </div>
        </template>
      </nav>
    </aside>
    <div v-if="!published && sidebarContextMenu" class="sidebar-context-menu" role="menu" aria-label="Bookmark actions" :style="{ left: `${sidebarContextMenu.x}px`, top: `${sidebarContextMenu.y}px` }">
      <button role="menuitem" @click="addCategoryFromContextMenu">Add category</button>
      <button role="menuitem" :disabled="!data.categories.length" @click="addBookmarkFromContextMenu">Add bookmark</button>
    </div>
    <main @contextmenu="showSidebarContextMenu($event)">
      <header class="topbar">
        <div>
          <h1>{{ published ? 'BookMark Commander' : 'BookMark Commander Editor' }}</h1>
        </div>
        <div class="toolbar-stack">
          <time v-if="published" class="published-clock" :datetime="currentDateTime.toISOString()">{{ currentDateTimeLabel }}</time>
          <div class="toolbar">
            <a v-if="published" class="settings-button" href="./BookMarkCommander_Editor.html" target="_blank" rel="noopener noreferrer">Bookmark Editor</a>
            <button v-if="!published" class="primary-button publish-button" @click="publish">Publish</button>
            <a v-if="!published" class="settings-button" href="./BookMarkCommander.html" target="_blank" rel="noopener noreferrer">Open Published Page</a>
            <label class="search-control"><span aria-hidden="true">⌕</span><input v-model="search" type="search" placeholder="Search your bookmarks..." aria-label="Search bookmarks" /></label>
            <div ref="settingsContainer" class="settings">
              <button class="settings-button" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen">⚙ <span>Settings</span> ⌄</button>
              <div v-if="settingsOpen" class="settings-menu">
                <button v-if="!published" @click="openBookmarksFile">Open Bookmarks file</button>
                <button v-if="!published" @click="saveBookmarksFile">Save Bookmarks file</button>
                <strong>Appearance</strong>
                <label class="settings-control">
                  <span>Background color</span>
                  <input type="color" :value="selectedBackgroundColor" aria-label="Background color" @input="changeBackgroundColor" />
                </label>
                <button class="reset-background" @click="resetBackgroundColor">Use theme default background</button>
                <label class="settings-control">
                  <span>Font type</span>
                  <select :value="data.fontFamily ?? 'default'" aria-label="Font type" @change="changeFontFamily">
                    <option v-for="font in fontOptions" :key="font.value" :value="font.value">{{ font.label }}</option>
                  </select>
                </label>
                <label class="settings-control">
                  <span>Font size: {{ data.fontSize ?? defaultFontSize }} px</span>
                  <input type="range" min="12" max="24" step="1" :value="data.fontSize ?? defaultFontSize" aria-label="Font size" @input="changeFontSize" />
                </label>
                <button v-for="option in [{ value: 'light', label: '☼  Light Mode' }, { value: 'dark', label: '☾  Dark Mode' }, { value: 'system', label: '▣  System Default' }] as const" :key="option.value" @click="changeTheme(option.value); settingsOpen = false">{{ option.label }} <span v-if="data?.theme === option.value">✓</span></button>
                <strong v-if="published">Published page</strong>
                <label v-if="published && publishedBookmarkView === 'cards'" class="settings-control">
                  <span>Card size: {{ publishedCardSize }} px</span>
                  <input v-model.number="publishedCardSize" type="range" min="220" max="480" step="20" aria-label="Card size" />
                </label>
                <small v-if="published">Appearance, view, and card-size changes last until this page is closed.</small>
              </div>
            </div>
            <div ref="helpContainer" class="settings">
              <button ref="helpButton" class="settings-button" :aria-expanded="helpMenuOpen" aria-controls="help-menu" @click="helpMenuOpen = !helpMenuOpen">? <span>Help</span> ⌄</button>
              <div v-if="helpMenuOpen" id="help-menu" class="settings-menu help-menu">
                <button @click="openInfoDialog('help')">Help</button>
                <button @click="openInfoDialog('about')">About</button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div v-if="error" class="alert" role="alert">{{ error }} <button @click="error = ''" aria-label="Dismiss error">×</button></div>
      <input v-if="!published" ref="importInput" class="visually-hidden" type="file" accept=".json,application/json" aria-label="Choose bookmarks JSON file" @change="importData" />
      <div v-if="!published" class="file-status" role="status">
        <span>{{ dirty ? 'Unsaved changes' : 'No unsaved changes' }}</span>
        <template v-if="dirty && exportRequested">
          <span>Check that your download saved.</span>
          <button class="text-button" @click="dirty = false; exportRequested = false">I saved the file</button>
        </template>
        <span v-if="publishRequested">Published page saved. Save your JSON separately.</span>
      </div>
        <section>
          <div class="section-title">
            <h2><span>↗</span> Quick Links</h2>
            <div class="rule"></div>
          </div>
          <div class="quick-grid">
            <div v-for="link in data.quickLinks" :key="link.id" class="quick-card">
              <a :href="link.url" target="_blank" rel="noopener noreferrer" :title="link.url">
                <img :src="favicon(link.url)" alt="" @error="($event.target as HTMLImageElement).style.display = 'none'" />
                <span><strong>{{ link.title }}</strong><small>{{ domain(link.url) }}</small></span>
              </a>
              <button v-if="!published" class="small-action" :aria-label="`Edit ${link.title}`" @click="openQuick(link)">✎</button>
              <button v-if="!published" class="small-action" :aria-label="`Delete ${link.title}`" @click="removeQuick(link)">×</button>
            </div>
            <button v-if="!published" class="quick-add" @click="openQuick()"><span>+</span> Add link</button>
          </div>
        </section>
        <section class="categories">
          <div class="section-title categories-title">
            <h2><span>▱</span> Categories</h2>
            <div class="rule"></div>
            <div v-if="published" class="bookmark-view-controls" role="group" aria-label="Bookmark view">
              <button class="category-control-button" :class="{ active: publishedBookmarkView === 'cards' }" aria-label="View bookmarks as cards" title="Card view" :aria-pressed="publishedBookmarkView === 'cards'" @click="publishedBookmarkView = 'cards'">
                <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="3" width="5.5" height="5.5" rx="1" /><rect x="3" y="11.5" width="5.5" height="5.5" rx="1" /><rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" /></svg>
              </button>
              <button class="category-control-button" :class="{ active: publishedBookmarkView === 'list' }" aria-label="View bookmarks as a list" title="List view" :aria-pressed="publishedBookmarkView === 'list'" @click="publishedBookmarkView = 'list'">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 4h9M8 10h9M8 16h9" /><circle cx="4" cy="4" r="1" /><circle cx="4" cy="10" r="1" /><circle cx="4" cy="16" r="1" /></svg>
              </button>
            </div>
            <div class="category-disclosure-controls" role="group" aria-label="Main category section controls">
              <button class="category-control-button" aria-label="Expand all main category sections" title="Expand all" @click="expandAllCategorySections"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 3.5 5 5 5-5M3 8l5 5 5-5" /></svg></button>
              <button class="category-control-button" aria-label="Collapse all main category sections" title="Collapse all" @click="collapseAllCategorySections"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 7 5-5 5 5M3 12l5-5 5 5" /></svg></button>
            </div>
          </div>
          <div v-if="!sections.length" class="empty">{{ search ? 'No bookmarks match your search.' : published ? 'No bookmarks have been published yet.' : data.categories.length ? 'No bookmarks yet. Add one above.' : 'Create a category before adding bookmarks.' }}</div>
          <section v-for="section in sections" :key="section.id" class="category-section" @contextmenu.stop="showSidebarContextMenu($event, section.id)">
            <div class="category-heading">
              <h3><button class="section-collapse-toggle" :aria-label="`${collapsedCategorySectionIds.has(section.id) ? 'Expand' : 'Collapse'} ${section.name}`" :aria-expanded="!collapsedCategorySectionIds.has(section.id)" @click="toggleCategorySection(section.id)"><svg class="category-chevron" :class="{ collapsed: collapsedCategorySectionIds.has(section.id) }" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>{{ section.name }}</button></h3>
              <span>{{ section.bookmarks.length }} {{ section.bookmarks.length === 1 ? 'bookmark' : 'bookmarks' }}</span>
              <div class="rule"></div>
              <template v-if="!published"><button class="small-action" :aria-label="`Rename ${section.name}`" @click="openCategory(section)">✎</button><button class="small-action" :aria-label="`Delete ${section.name}`" @click="removeCategory(section)">×</button></template>
            </div>
            <template v-if="!collapsedCategorySectionIds.has(section.id)">
              <div v-if="!section.bookmarks.length" class="empty compact">No bookmarks in this category yet.</div>
            <div class="bookmark-grid" :class="{ 'list-view': published && publishedBookmarkView === 'list' }">
              <article v-for="bookmark in section.bookmarks" :id="`bookmark-${bookmark.id}`" :key="bookmark.id" class="bookmark-card" :class="{ highlighted: highlightedBookmarkId === bookmark.id }">
                <a class="bookmark-cover" :href="bookmark.url" target="_blank" rel="noopener noreferrer" :aria-label="`Open ${bookmark.title}`">
                  <img v-if="bookmark.image" :src="bookmark.image" alt="" />
                  <span v-else class="cover-fallback"><img :src="favicon(bookmark.url)" alt="" @error="($event.target as HTMLImageElement).style.display = 'none'" /><span>{{ bookmark.title.charAt(0).toUpperCase() }}</span></span>
                </a>
                <div class="card-content"><a :href="bookmark.url" target="_blank" rel="noopener noreferrer"><strong>{{ bookmark.title }}</strong><small>{{ domain(bookmark.url) }}</small></a><button v-if="!published" class="small-action" :aria-label="`Edit ${bookmark.title}`" @click="openBookmark(bookmark)">✎</button><button v-if="!published" class="small-action" :aria-label="`Delete ${bookmark.title}`" @click="removeBookmark(bookmark)">×</button></div>
              </article>
            </div>
            </template>
          </section>
        </section>
    </main>
    <div v-if="dragging" class="drag-overlay">Drop to add bookmark</div>
    <div v-if="infoDialog" class="modal-backdrop" @click.self="closeInfoDialog">
      <div class="modal info-modal" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title">
        <div class="modal-heading">
          <h2 id="info-dialog-title">{{ infoDialog === 'help' ? 'Help' : 'About' }}</h2>
          <button ref="infoCloseButton" class="small-action" aria-label="Close" @click="closeInfoDialog">×</button>
        </div>
        <div v-if="infoDialog === 'help'" class="info-content">
          <p>Use BookMark Commander Editor to manage your bookmarks and create a read-only page.</p>
          <h3>Load a JSON file</h3>
          <p>Open BookMarkCommander_Editor.html, then choose <strong>Settings → Open Bookmarks file</strong> and select your saved bookmarks JSON. Opening a file replaces the current collection; you will be warned if you have unsaved changes. You can also start with an empty collection.</p>
          <h3>Save a JSON file</h3>
          <p>Choose <strong>Settings → Save Bookmarks file</strong> after editing. Choose a location if prompted, or check your browser's downloads for bookmarks.json. Keep this file to make future edits. If prompted in the editor, confirm that the download was saved.</p>
          <h3>Publish the page</h3>
          <p>In the standalone editor, select <strong>Publish</strong> and choose a location if prompted, or check your browser's downloads for BookMarkCommander.html. Open that file in a browser to view and search your bookmarks. It is read-only; use the editor and your JSON file to make changes, then publish again.</p>
          <p>Publishing does not save your JSON file. Save it separately whenever you make changes.</p>
        </div>
        <div v-else class="info-content">
          <p>BookMark Commander</p>
          <p>Version: {{ appVersion }} (build timestamp)</p>
        </div>
      </div>
    </div>
    <div v-if="dialog" class="modal-backdrop" @click.self="dialog = null">
      <div class="modal" role="dialog" aria-modal="true" :aria-labelledby="'dialog-title'">
        <div class="modal-heading"><h2 id="dialog-title">{{ editingId ? 'Edit' : 'Add' }} {{ dialog === 'quick' ? 'quick link' : dialog }}</h2><button class="small-action" aria-label="Close" @click="dialog = null">×</button></div>
        <form @submit.prevent="submit">
          <label>Name <input v-model="formTitle" required maxlength="200" autofocus /></label>
          <label v-if="dialog !== 'category'">URL <input v-model="formUrl" required placeholder="https://example.com" /></label>
          <template v-if="dialog === 'bookmark'">
            <label>Category <select v-model="formCategory" required><option v-for="category in data.categories" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
            <label>Cover image <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" @change="readImage" /><small>Optional. PNG, JPEG, GIF or WebP, up to 2 MB.</small></label>
            <div v-if="formImage" class="image-preview"><img :src="formImage" alt="Cover preview" /><button type="button" class="text-button" @click="formImage = null; if (fileInput) fileInput.value = ''">Remove image</button></div>
          </template>
          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
          <div class="form-actions"><button type="button" class="pill" @click="dialog = null">Cancel</button><button class="primary-button" :disabled="readingImage">{{ readingImage ? 'Reading image…' : 'Done' }}</button></div>
        </form>
      </div>
    </div>
  </div>
</template>
