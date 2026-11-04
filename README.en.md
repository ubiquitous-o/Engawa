<p align="center"><img src="public/icons/icon128.png" width="96" height="96" alt="Engawa icon"></p>

# Engawa

[日本語](README.md)

An *engawa* is the wooden veranda that runs along the side of a Japanese house. Engawa is a personal Manifest V3 extension that lines up favorites, bookmarks, GitHub pull requests and open tabs in Chrome's side panel.
Favorites simply display one or more folders on the bookmarks bar; the extension never writes to your bookmarks (and never uses pinned tabs). Remove the extension or move to another browser and your bookmarks are untouched. The only things the extension keeps for itself are settings, the GitHub token, the PR list and the favorite↔tab map.

## Install

Grab `engawa-vX.Y.Z.zip` from [Releases](https://github.com/ubiquitous-o/Engawa/releases), unzip it, and load the folder with steps 1–2 below.

## Build from source

```bash
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode** (top right)
2. **Load unpacked** → pick this repository's `dist/` folder
3. Click the toolbar icon or press **Alt+S** to open the side panel

Favorites have no dedicated folder: pick any folders under the bookmarks bar to "show as favorites". Each chosen folder gets its own section. With nothing picked, the bookmarks bar itself is used.

The extension ID is pinned by the `key` (public key) in `manifest.json` (`lmjcicaaeilbjpcbimnclhafocijlifc`). An unpacked extension normally gets its ID from the folder it was loaded from, so unzipping a release somewhere else and loading it again would count as a different extension and lose your settings; with `key` the ID is the same wherever it is loaded from, so settings, token and favorites folders survive. Chrome loads only one extension per ID at a time, so remove the old copy before loading the new one. `key` is a public key, not a secret, and loading an unpacked extension needs no private key, so there is nothing to manage.

While developing, `npm run dev` (`vite build --watch`) keeps `dist/` up to date; press the reload button on `chrome://extensions` to pick up changes.

To release, bump `version` in `package.json` and push a `v`-prefixed tag; GitHub Actions builds the zip and attaches it to the release. `npm run package` builds the same zip locally into `release/`.

## GitHub integration

1. Create a token. You want every PR you are involved in, so pick a kind that does not make you hand-pick repositories
   - **Classic token** (recommended): on the [new token page](https://github.com/settings/tokens/new) check the **`repo`** scope. It covers your own repositories, every org you belong to, and anything you are invited to later. For orgs with SSO, authorize the token via "Configure SSO" after creating it
   - A fine-grained token also works, but even with "All repositories" it covers a single owner. If your PRs span orgs, use classic
2. Open the extension's options page (gear icon at the top right of the panel), paste the token and save. "Test connection" should return your login
3. Every 5 minutes (configurable) "review requested" and "my PRs" are synced into the side panel

- The token is stored only in `chrome.storage.local`. It never goes into `storage.sync` and never appears in logs
- The PR list lives in `chrome.storage.local`. Nothing is written to bookmarks, so each device needs its own token
- 401 → the badge shows `!` and the panel points you to the options page. 403/429 → the interval doubles until the next successful sync
- For GitHub Enterprise, change the API base URL in the options page to `https://ghe.example.com/api/v3` (you will be asked to grant access to that host)

## Usage

| Action | Result |
| --- | --- |
| Folder button next to "Favorites" / right-click a folder in the tree → Show as favorites | Choose which folders are shown as favorites (click to toggle, several allowed). The tree marks them with ★. Unselecting all falls back to the bookmarks bar |
| Click a favorite tile | Switch to its tab if one exists, otherwise open a new one. Open items show a dot |
| Right-click a favorite | Restore original URL / Close tab / Remove from favorites (moves to Other bookmarks) / Delete |
| Drag a tab or bookmark onto favorites | Add to that folder or reorder. With several folders, right-click "Add to favorites" lists one entry per folder |
| Drag a tab onto the bookmark tree | Drop on a folder to add inside it, between rows to add next to them, or on the drop zone below to append to the bookmarks bar |
| Drag a bookmark | Reorder or move into a folder |
| Click a bookmark | Opens in a new tab. If the URL is a favorite, no new tab is added: it opens as that favorite's tab (the tile lights up). Middle-click / Cmd+click opens in the background. Right-click offers "Open in current tab" |
| Double-click a bookmark / right-click → Rename | Rename inline |
| `/` | Focus search |
| `↑` `↓` | Move between items (across sections) |
| `Enter` | Open / toggle folder |
| `←` `→` | Collapse / expand folder |
| `Esc` | Clear search |

Tabs that belong to a favorite do not appear in the "Tabs" list, just like pinned tabs in Arc. The tile's mark is the only indicator.

The tab list overlaps with Chrome's native vertical tabs, so it can be turned off in the options.

## Appearance

The "Background" card in the options page builds an Arc-style background.

- **Presets**: Dusk / Engawa (green × brown) / Ocean / Sunset / Lavender / Moss / Slate. The **+** at the end saves the current look (colors, angle, intensity, grain) under a name; hover a saved preset and hit × to delete it
- **Type**: two-color gradient or a single color
- **Colors**: start and end via color pickers; **angle** from 0 to 360°
- **Intensity**: how much color is mixed into the white (or, in dark mode, black) base
- **Grain**: Arc-like texture, drawn with an SVG noise filter, so no image assets are shipped
- The options page itself uses the same background, so you can tune it live

The accent color (selection rings, badges) is chosen separately. Light/dark follows the OS.

## Chrome limitations

- **The tab strip and the address bar cannot be hidden by an extension.** Chrome's native vertical tabs feature removes the horizontal tab strip, nothing more
- **Chrome sets the side panel's minimum width** (around 320px). An extension cannot make it narrower. Use "Compact mode" in the options to fit more into the same width

## Layout

```
src/
  manifest.json
  background/index.ts     # startup, alarms, message handling
  background/github.ts    # GitHub search API, PR folder diff sync, badge, notifications
  background/favorites.ts # favorite ↔ tab map (storage.session) and URL matching
  sidepanel/              # side panel UI (Preact)
  options/                # options page
  shared/                 # types, storage, messages, bookmark helpers
scripts/gen-icons.mjs     # generates the icon PNGs (npm run icons)
```

Manifest V3 / TypeScript / Vite / Preact. No external servers; the only network destination is the GitHub API.
