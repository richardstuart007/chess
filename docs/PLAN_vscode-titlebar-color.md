# PLAN_vscode-titlebar-color — chess

## Title
Less bright title bar / activity bar color in VS Code workspace settings

## Plan
- [x] `.vscode/settings.json` — change `workbench.colorCustomizations`'s
      `titleBar.activeBackground`, `titleBar.inactiveBackground`, and `activityBar.background`
      from `#eab308` (Tailwind `yellow-500`) to `#ca8a04` (Tailwind `yellow-600`) — same hue, less
      bright/saturated. Foreground colors (`#1f2937`, `#4b5563`) left as-is; still contrast fine.
- [x] Follow-up: the project name text was showing as white against the yellow background —
      poor contrast. Switch `titleBar.activeBackground`/`titleBar.inactiveBackground`/
      `activityBar.background` to a dark color (`#1f2937`, dark slate — already used elsewhere in
      this palette as foreground) and set `titleBar.activeForeground`/`titleBar.inactiveForeground`/
      `activityBar.foreground` to white (`#ffffff`) explicitly, per user agreement.

## Changes
### .vscode/settings.json
- `titleBar.activeBackground`, `titleBar.inactiveBackground`, `activityBar.background`:
  `#eab308` → `#ca8a04` → `#1f2937` (dark slate) → `#4d4400` (dark mustard yellow, user's final
  pick after experimenting directly in the file — dark enough for white text to read clearly,
  while staying unambiguously yellow rather than gray/slate/brown).
- `titleBar.activeForeground`, `titleBar.inactiveForeground`, `activityBar.foreground`:
  final state `#ffffff` (white) across all three.

## Testing
- [x] User confirmed final color (`#4d4400` background / `#ffffff` foreground) directly while
      experimenting — background reads dark yellow, project name (white text) clearly legible.
