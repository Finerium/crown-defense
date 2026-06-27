# TALOS Command — proposal screenshots

8 full-page captures at 1560px desktop width, both themes:

- 01–04: Command Overview, Incident Detail, Fleet & Hosts, System Health — **Dark** (primary)
- 05–08: same screens — **Light**

## How these were made (for regeneration)
The app has a hidden capture mode used to produce wide, full-height captures
from a small preview pane:

1. Add class `capture` to `<html>` — forces 1560px desktop layout, expands
   internal scroll areas, disables animations, makes the topbar non-sticky
   (see "capture mode" section at the bottom of `talos.css`).
2. Set `window.__talosFreeze = true` to pause the live feed ticker.
3. Navigate with `window.__talos.go('overview'|'incident'|'fleet'|'system')`
   and `window.__talos.theme('dark'|'light')`.
4. Screenshot viewport tiles at scroll offsets (x: 0 / 700, y: steps of 530),
   then composite tiles onto a 1560×H canvas at their scroll offsets.

Screen heights at 1560px: overview 1010 · incident 1895 · fleet 1623 · system 944.
