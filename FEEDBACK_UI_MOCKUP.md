# Consultant Feedback UI - Visual Mockup

## Report Card with Rejection Alert

```
┌─────────────────────────────────────────────────────────────────┐
│ Mine saksrapporter                          [Tilbake]          │
└─────────────────────────────────────────────────────────────────┘

┌────────────────────────────────┐  ┌────────────────────────────────┐
│ SAK-2025-123                   │  │ SAK-2025-456                   │
│ 2025-03                        │  │ 2025-02                        │
│                     [Approved] │  │                      [Rejected]│
│                                │  │                                │
│ ⚠️ REJECTION ALERT (Clickable)│  │                                │
│ ┌──────────────────────────────┤  │                                │
│ │ ⚠️ Rapporten ble avslått     │  │                                │
│ │                              │  │                                │
│ │ Manglende detaljer i        │  │                                │
│ │ vurderingsdelen...          │  │                                │
│ │                              │  │                                │
│ │ Avslått av admin • 15. mars │  │                                │
│ │ 2025, 14:30                  │  │                                │
│ │                              │  │                                │
│ │ Klikk for å se detaljert    │  │                                │
│ │ tilbakemelding →            │  │                                │
│ └──────────────────────────────┤  │                                │
│                                │  │                                │
│ [Rediger] [Send inn]           │  │ [Rediger] [Send inn]           │
│ [Se tilbakemelding]            │  │                                │
└────────────────────────────────┘  └────────────────────────────────┘
```

## Feedback Dialog (Modal)

```
╔═══════════════════════════════════════════════════════════════════╗
║ Tilbakemelding på rapport                                    [×] ║
║ SAK-2025-123 • 2025-03                                            ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║ ┌───────────────────────────────────────────────────────────────┐ ║
║ │ ⚠️  Rapporten er avslått                                     │ ║
║ │                                                               │ ║
║ │     Din rapport har blitt gjennomgått og krever endringer    │ ║
║ │     før den kan godkjennes. Se detaljer nedenfor.            │ ║
║ └───────────────────────────────────────────────────────────────┘ ║
║                                                                   ║
║ ┌───────────────────────────────────────────────────────────────┐ ║
║ │ Årsak til avslag                                              │ ║
║ │                                                               │ ║
║ │ Vurderingsdelen mangler tilstrekkelig informasjon om          │ ║
║ │ brukerens fremgang. Vennligst utdyp følgende:                │ ║
║ │                                                               │ ║
║ │ 1. Konkrete eksempler på forbedringer                         │ ║
║ │ 2. Målbare resultater fra innsatsen                           │ ║
║ │ 3. Sammenligning med forrige måned                            │ ║
║ │                                                               │ ║
║ │ Anbefalingsdelen må også være mer spesifikk når det kommer    │ ║
║ │ til neste måned sin handlingsplan.                            │ ║
║ └───────────────────────────────────────────────────────────────┘ ║
║                                                                   ║
║ Avslått av: Administrator                                         ║
║ Dato: 15. mars 2025, 14:30                                        ║
║                                                                   ║
║ ───────────────────────────────────────────────────────────────── ║
║                                                                   ║
║ Neste steg                                                        ║
║                                                                   ║
║ ⓵  Les tilbakemeldingen nøye og noter hvilke deler som må       ║
║    endres                                                         ║
║                                                                   ║
║ ⓶  Klikk "Rediger" på rapporten for å gjøre endringer           ║
║                                                                   ║
║ ⓷  Send inn rapporten på nytt når endringene er gjort           ║
║                                                                   ║
║ ┌───────────────────────────────────────────────────────────────┐ ║
║ │ ℹ️  Trenger du hjelp?                                         │ ║
║ │                                                               │ ║
║ │     Hvis du er usikker på hva som må endres, ta kontakt med  │ ║
║ │     din kontaktperson eller administrator.                    │ ║
║ └───────────────────────────────────────────────────────────────┘ ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                        [Lukk]  [📝 Rediger nå]  ║
╚═══════════════════════════════════════════════════════════════════╝
```

## Color Coding

### Report Card
- **Approved**: Green chip badge
- **Submitted**: Yellow/orange chip badge  
- **Rejected**: Red chip badge
- **Draft**: Gray chip badge

### Alert Banner (Rejection)
- Background: Light red (#fef2f2)
- Border: Red (#ef4444)
- Icon: ⚠️ WarningAmber in red
- Text: Red for emphasis, gray for metadata
- Cursor: Pointer (indicates clickable)

### Feedback Dialog

#### Status Banner (Top)
- Background: Light red
- Border: Red
- Icon: Large ⚠️ WarningAmber
- Typography: Bold title + body text

#### Rejection Reason Box
- Background: Very light red (#fef2f2)
- Border: Light red (#fca5a5)
- Text: Dark red for heading, black for content
- Padding: Generous (16px)

#### Step Numbers
- Background: Primary blue (#2196f3)
- Color: White
- Shape: Circular badge (24×24px)
- Font: Bold, 14px

#### Help Section
- Background: Light blue (#e3f2fd)
- Border: Light blue (#90caf9)
- Icon: ℹ️ InfoOutlined in blue

## Button Styles

### On Report Card
```
┌──────────┐  ┌────────────┐  ┌─────────────────┐
│ Rediger  │  │ Send inn   │  │ Se tilbakemelding│
└──────────┘  └────────────┘  └─────────────────┘
  Outlined      Contained          Text
  (Default)     (Primary)        (Error color)
```

### In Dialog Footer
```
┌────────┐         ┌──────────────┐
│  Lukk  │         │ 📝 Rediger nå│
└────────┘         └──────────────┘
  Text              Contained
  (Default)         (Primary)
```

## Responsive Behavior

### Desktop (≥960px)
- Dialog: 900px max width, centered
- Report cards: 2 columns (6/12 grid)
- All content visible without scrolling

### Tablet (600-959px)
- Dialog: Full width with margins
- Report cards: 2 columns
- Scrollable dialog content

### Mobile (<600px)
- Dialog: Full screen
- Report cards: 1 column (12/12 grid)
- Stacked layout for all content
- Larger touch targets (min 48×48px)

## Interaction States

### Alert Banner
- **Default**: Light red background, red border
- **Hover**: Slight darkening, cursor: pointer
- **Active/Click**: Opens dialog with smooth transition

### Buttons
- **Default**: As styled above
- **Hover**: Slight color darkening
- **Focus**: Blue outline (accessibility)
- **Active**: Darker pressed state
- **Disabled**: Gray, low opacity

### Dialog
- **Enter**: Fade in + slide up animation (200ms)
- **Exit**: Fade out (150ms)
- **Backdrop**: Dark overlay (50% opacity)
- **Backdrop click**: Closes dialog
- **Escape key**: Closes dialog

## User Experience Flow

### Happy Path
1. User sees rejected report with red alert
2. User clicks alert or "Se tilbakemelding" button
3. Dialog opens with full feedback
4. User reads feedback carefully
5. User clicks "Rediger nå" in dialog
6. Dialog closes, report opens in edit mode
7. User makes required changes
8. User clicks "Send inn"
9. Report status changes to "submitted"
10. Alert disappears

### Alternative Path
1. User sees rejected report
2. User clicks "Rediger" directly (skips dialog)
3. Report opens in edit mode
4. User can still click "Se tilbakemelding" to review feedback
5. Makes changes and submits

## Accessibility Features

- ✅ Keyboard navigation: Tab through all interactive elements
- ✅ Escape key closes dialog
- ✅ Focus trapped within dialog when open
- ✅ Screen reader announcements for dialog open/close
- ✅ Semantic HTML: `<dialog>`, `<button>`, `<alert>`
- ✅ ARIA labels on icon buttons
- ✅ Color contrast: WCAG AA compliant
- ✅ Focus indicators: Blue outline on all focusable elements
- ✅ Error states: Announced by screen readers

## Localization

All text uses Norwegian (Bokmål) locale:
- Dates: "15. mars 2025, 14:30"
- Numbers: European format
- Text: Norwegian UI strings via `t()` function

Fallback text provided for all translation keys in case of missing translations.
