# PLAN_filtermulticheckbox-myselectmulti — chess

## Title
Convert FilterMultiCheckbox to a thin wrapper around nextjs-shared/MySelectMulti

## Plan
- [x] Reinstall nextjs-shared to pick up the latest version (MySelectMulti, showReset/resetLabel, and other recent additions)
- [x] Rewrite `src/ui/filters/FilterMultiCheckbox.tsx` as a thin wrapper around `nextjs-shared/MySelectMulti`, preserving the existing call-site API (`label`, `options`, `selected`, `onChange`, `width`) so none of the 6+ existing `<FilterMultiCheckbox ...>` call sites need to change:
  ```tsx
  'use client'

  import MySelectMulti from 'nextjs-shared/MySelectMulti'

  interface FilterOption {
    value: string
    label: string
  }

  interface FilterMultiCheckboxProps {
    label?: string
    options: (string | FilterOption)[]
    selected: string[]
    onChange: (values: string[]) => void
    width?: string
  }

  export default function FilterMultiCheckbox({ label, options, selected, onChange, width = 'w-20' }: FilterMultiCheckboxProps) {
    return (
      <MySelectMulti
        label={label}
        options={options}
        selected={selected}
        onChange={onChange}
        overrideClass={`${width} md:${width} h-6 md:h-6 px-1 text-xxs truncate`}
      />
    )
  }
  ```
  Both `${width}` and its `md:` variant are set explicitly since `MySelectMulti`'s default trigger class has a `md:h-8`/`md:w-72` responsive pair — a bare override without the `md:` version would leave the old fixed width/height active above that breakpoint.
- [x] Type-check with `npx tsc --noEmit` and build with `npm run build`

## Changes

### src/ui/filters/FilterMultiCheckbox.tsx
- Replaced the local checkbox-dropdown multi-select implementation with a thin wrapper around `nextjs-shared/MySelectMulti`, keeping the exact same call-site API (`label`, `options`, `selected`, `onChange`, `width`) so every existing call site is unaffected. `overrideClass` repeats both the bare and `md:` variants of width/height to fully cancel `MySelectMulti`'s own responsive defaults (`h-6 md:h-8`, `w-72`), per the established `myMergeClasses` gotcha.
- Reinstalled `node_modules`/`package-lock.json`/`.next` to pick up nextjs-shared's latest version (includes `MySelectMulti`, `showReset`/`resetLabel`, and everything else added since chess last installed).
- `npx tsc --noEmit` and `npm run build` both clean.

## Testing
- [x] Open a page using `FilterMultiCheckbox` (e.g. a game list or opening-score chart filter) and confirm the dropdown opens, options toggle correctly, and the trigger shows "All"/"N selected" as before.
- [x] Confirm the dropdown closes when clicking outside it.
- [x] Confirm the trigger button's width/sizing looks the same as before the swap (compact, matching the surrounding filter bar), not the wider default `MySelectMulti` styling.
