# Changelog

All notable changes to Shard Icons are listed here. Versions follow
[semantic versioning](https://semver.org). Notes for releases before 1.0.0 are on the
[releases page](https://github.com/cachewraith/shard-icons/releases).

## 1.1.0 — 2026-11-05

### Added

- **Icons in search results.** Each file in the search pane now shows the same icon it has in
  the file explorer, beside its name. A file shows the icon you chose for it, or, with
  _File icons_ on, the one matched from its name and extension. Icons follow your changes,
  your theme and scrolling, and are removed when the plugin is turned off.

## 1.0.0 — 2026-11-01

Shard Icons is now stable. This release fixes icons that could go missing at startup and makes
the icon picker's search much more capable. Your settings and icon choices carry over unchanged.

### Fixed

- **Icons missing until a file was opened.** At startup, Obsidian can show a file-explorer row
  before giving it its path. Shard Icons skipped such rows and only drew their icons on the next
  layout change, usually when you opened a file. Rows are now drawn as soon as their path is
  set.
- **Searches that matched far too much.** Search used to look at an icon's internal id, so
  typing `go` matched all 406 logos (through `logo-`), and `folder` matched every folder icon.
  Only an icon's name, label and aliases are searched now.

### Added

- **Search by extension and folder name.** Icons can be found by the file extensions and folder
  names the Material Icon Theme gives them. `md` finds Markdown, `py` Python, `pictures` the
  images folder and `db` the database folder. Logos share these aliases too, so `ts` finds the
  TypeScript logo.
- **Everyday words.** Common words lead to the right icon even when it is named differently:
  `note` finds Markdown, `photo` finds images, `music` finds audio and `password` finds keys.
- **Typo tolerance.** When nothing matches exactly, the picker shows close matches and says so.
  `pyhton` still finds Python, and `typscript` finds TypeScript.
- **Match counts on every tab.** A search now covers all four tabs at once. Each tab shows how
  many icons match, and tabs without matches are dimmed.

### Changed

- **Ranked results.** Results are ordered by how well they match: exact names first, then names
  that start with your search, then everything else. `git` now lists Git before GitHub Actions.
- **The picker follows your search.** If the open tab has no match, the picker shows the first
  tab that does. It returns to your tab once that tab matches again.
- **Smoother typing.** The grid redraws once you pause typing rather than on every key press.
  <kbd>Enter</kbd> and the arrow keys always act on what you just typed.
- **Rewritten README,** with a getting-started guide, search tips and an FAQ.
