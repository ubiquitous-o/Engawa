<p align="center"><img src="public/icons/icon128.png" width="96" height="96" alt="Engawa icon"></p>

# Engawa

[日本語](README.md)

An *engawa* is the wooden veranda that runs along the side of a Japanese house. Engawa is a personal Manifest V3 extension that lines up favorites, bookmarks, GitHub pull requests and open tabs in Chrome's side panel.
Favorites simply display a folder on the bookmarks bar; the extension never writes to your bookmarks (and never uses pinned tabs). Remove the extension or move to another browser and your bookmarks are untouched. The only things the extension keeps for itself are settings, the GitHub token, the PR list and the favorite↔tab map.

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

Favorites have no dedicated folder: pick any folder under the bookmarks bar to "show as favorites". With nothing picked, the bookmarks bar itself is used.

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
| Folder button next to "Favorites" / right-click a folder in the tree → Show as favorites | Choose which folder is shown as favorites. The tree marks it with ★ |
| Click a favorite tile | Switch to its tab if one exists, otherwise open a new one. Open items show a dot |
| Right-click a favorite | Restore original URL / Close tab / Remove from favorites (moves to Other bookmarks) / Delete |
| `+` tile | Add the current tab to favorites |
| Drag a tab or bookmark onto favorites | Add to favorites or reorder |
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
