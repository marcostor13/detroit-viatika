# Viatika Design System & UI Kit

This official design system guarantees a consistent, modern, and accessible visual identity across the Viatika platform. All new components and layouts MUST strictly follow these guidelines.

## 1. Core Variables & Configuration
The project uses Tailwind CSS customized with specific design tokens. Always configure `tailwind.config.js` or standard global CSS to include these defaults:

```js
theme: {
  extend: {
    colors: {
      "primary": "#1173d4",
      "background-light": "#f6f7f8",
      "background-dark": "#101922",
    },
    fontFamily: {
      "display": ["Inter", "sans-serif"]
    },
    borderRadius: {
      "DEFAULT": "0.25rem", // 4px
      "lg": "0.5rem",       // 8px
      "xl": "0.75rem",      // 12px
      "full": "9999px"
    },
  }
}
```

## 2. Global Styling & Foundation
- **Base Font**: 'Inter', sans-serif. Use `font-display` utility if specified.
- **Body Styling**: `<body class="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 font-display">`
- **Dark Mode Strategy**: Class-based `dark:`. Default colors are neutral Slates.

## 3. Color Palette Usage
### Backgrounds
- App Background (Light): `bg-background-light`
- App Background (Dark): `bg-background-dark`
- Surface/Card Backgrounds (Light): `bg-white` or `bg-slate-50`
- Surface/Card Backgrounds (Dark): `dark:bg-slate-900` or `dark:bg-slate-800`
- Hover States (Light): `hover:bg-slate-50` or `hover:bg-slate-100`
- Hover States (Dark): `dark:hover:bg-slate-800` or `dark:hover:bg-slate-800/50`

### Text
- Primary Text (Light): `text-slate-900`
- Primary Text (Dark): `text-slate-100` (or `text-white`)
- Secondary/Muted Text: `text-slate-500` or `text-slate-600` (Light) / `dark:text-slate-400` (Dark)

### Borders & Indicators
- Standard Line/Border: `border-slate-200` (Light) / `dark:border-slate-800` (Dark)
- Important Element Border: `border-primary`

### Semantic Colors
- **Primary**: `bg-primary`, `text-primary`. Used for actions, links, and main branding.
- **Success (Emerald/Green)**: `text-emerald-500` / `bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400`. Used for "Done", "Paid", "Success" states.
- **Warning (Amber/Orange)**: `text-amber-500` / `bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400` or Orange variants. Used for "Review", "Pending".
- **Danger (Red/Rose)**: `text-red-500` / `bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400`. Used for "Failed", "Rejected", "Overdue".

## 4. Typography Rules
- **Headings**: Use `font-bold` or `font-extrabold` and `tracking-tight`. Example: `text-3xl font-extrabold tracking-tight`. Always use `text-slate-900 dark:text-white`.
- **Subheadings/Titles**: `text-xl font-bold` or `text-lg font-bold`.
- **Overlines/Labels**: `text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400`. Extremely important for tags or small list headers.
- **Microcopy**: `text-[10px]` or `text-xs` for timestamps, soft text.

## 5. Shape & Structure
- **Cards & Modals (Containers)**: `rounded-xl` (12px). Should always include a soft border `border border-slate-200 dark:border-slate-800` and soft shadow `shadow-sm`.
- **Buttons & Inputs**: `rounded-lg` (8px).
- **Badges/Tags/Avatars**: `rounded-full` or occasionally `rounded` for square-like mini-badges.

## 6. Components Toolkit

### Buttons
- **Primary Solid**: `bg-primary text-white hover:bg-primary/90 px-4 py-2 rounded-lg font-semibold text-sm transition-colors shadow-sm`
- **Secondary/Ghost**: `text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 px-4 py-2 rounded-lg font-semibold text-sm transition-colors`
- **Border/Outline**: `bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all`
- **Icon Actions (List tables, mini buttons)**: `text-slate-400 hover:text-primary transition-colors`. Sometimes with soft backgrounds: `hover:bg-primary/10 rounded-lg`.

### Inputs & Forms
- **Standard Input**: `bg-slate-100 dark:bg-slate-800 border-none rounded-lg focus:ring-2 focus:ring-primary px-4 py-2 text-sm placeholder:text-slate-400 w-full`
- Do not use outlines unless focused. Soft background fills are preferred over heavy borders.

### Badges & Pill Tags
- Used for indicating status in tables or lists.
- **Style**: `px-2 py-1` or `px-2.5 py-0.5`, `rounded-full`, `text-[10px]` or `text-xs`, `font-bold` and optionally `uppercase tracking-wider`.
- **Coloring**: Always paired light foreground with very light background. `bg-{color}-100 dark:bg-{color}-900/30 text-{color}-700 dark:text-{color}-400`.

### Data Tables
- **Container**: Must be inside a card with `overflow-x-auto`.
- **Header (`<th>`)**: `bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider`
- **Row (`<tr>`)**: `border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors`
- **Cells (`<td>`)**: `px-6 py-4 text-sm`. Text should be default color or `text-slate-500` for secondary columns. Actions aligned to the right.

### Icons
- Standard Library: `Google Material Symbols Outlined`.
- Sizing: Usually `text-lg` or `text-xl` or just default. Use `text-sm` for smaller insertions next to text.
- HTML implementation: `<span class="material-symbols-outlined">icon_name</span>`

## 7. Layout & Spacing Defaults
- Main layout is full screen `h-screen` or `min-h-screen` with a fixed sidebar `w-64` and a flexible main area `flex-1`.
- Header size is usually `h-16`.
- Internal grid gaps should be `gap-4` or `gap-6`.
- Main content padding should be `p-6 md:p-8`. Maximum width constraints applied (`max-w-7xl mx-auto`) for inner text content readability.

Any developer or AI agent touching the UI MUST follow these patterns exactly. Use copy-paste styling blocks from this document when generating new pages.
