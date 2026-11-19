# Bookmark Commander

Bookmark Commander consists of a bookmark editor and a self-contained, read-only page. Neither requires a server, Node.js, or an internet connection to run. Opening online bookmarks and loading site icons does require an internet connection; the site can see its icon request.

## Editing and publishing

1. Open `BookMarkCommander_Editor.html` in a modern browser.
2. Select **Settings → Open Bookmarks file** to load an existing JSON file, or start with an empty collection. JSON files from earlier versions are supported. From a newly published page, select **Bookmark Editor** to open the editor with that page's bookmarks already loaded.
3. Add, change, or delete bookmarks, quick links, and categories. Every bookmark must belong to a category. Right-click either editor pane for category and bookmark actions; right-clicking a category section preselects it for a new bookmark. Drag a web link onto the editor to add a bookmark. Optional uploaded covers are included in both files.
4. Select **Settings → Save Bookmarks file**. If your browser supports a save-location picker, choose where to save `bookmarks.json`; otherwise it downloads using the browser's normal download behavior. Keep this JSON file: it is needed for future edits.
5. Use **Settings** to choose a background color, font family, and font size. These choices are included when you publish.
6. Select **Publish**. The editor first opens the save flow for `bookmarks.json`; publishing continues only after the JSON is saved. If your browser downloads it instead of prompting for a location, confirm that it was saved. Then choose where to save `BookMarkCommander.html`, or check your downloads. Open that file in any modern browser to view and search your bookmarks without importing JSON. The published page is read-only; its category pane is for navigation only. Edit and republish using the editor.

Publishing creates separate JSON and HTML files; keep the JSON file for future edits. Bookmarks loaded from a published page are a working copy and are saved as JSON before publishing. On the published page, the icons in the Categories heading switch bookmarks between card and list views; Settings changes card size while in card view. Categories can be independently expanded or collapsed in both panes, with controls to expand or collapse all categories in each pane. The current local date and time appear above the toolbar and update every second (for example, `Friday, November 13, 2026. 5:15:43`). Published-page appearance, view, and card-size changes last only until the page is closed.

The **Help** toolbar menu provides these load, save, and publish instructions. **Help → About** shows the application's build timestamp with its time-zone offset; a published page retains the version of the editor that created it.

Bookmarks are sorted by name within each category. A `BookMarkCommander.html` from an earlier version is not updated automatically; replace it with the newly published file.

Bookmarks without a category in older JSON or published files are moved into an **Uncategorized** category when loaded. A category containing bookmarks cannot be deleted until those bookmarks are moved to another category.

Both pages show categories and their bookmarks in the left pane. Use the chevrons to expand or collapse a category's bookmarks, and the controls beside the Categories heading to expand or collapse all sidebar categories. Click a blank area in that pane to clear the category and search filters and show everything.

## Development

Building requires Node.js 22.18 or later in the 22.x series, or 24.12 or later.

```sh
npm install
npm run build
```

The build produces `BookMarkCommander_Editor.html` in the project folder. Use that standalone file to publish; publishing is not available in the Vite development page. `npm run dev` starts Vite for development.
