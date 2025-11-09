# Consultant Feedback UI

**Status**: Implemented ✅  
**Commit**: e2870d2  
**File**: `frontend/app/case-reports/page.tsx`

## Overview

Enhanced user interface for consultants to receive and understand feedback on rejected case reports. Provides clear, actionable guidance for fixing issues and resubmitting reports.

## Features

### 1. Enhanced Rejection Alert
- **Clickable banner** on rejected reports
- Shows rejection reason preview
- Displays who rejected and when
- Visual indicator prompting user to click for details
- WarningAmber icon for clear visibility

### 2. Detailed Feedback Dialog
When clicked, opens a comprehensive modal showing:

#### Status Banner
- Large error alert explaining report rejection
- Context about review process
- Clear messaging that changes are required

#### Rejection Details Section
- Highlighted paper component with error styling
- Full rejection reason with preserved formatting (whitespace)
- Clear visual separation from other content

#### Metadata Display
- **Rejected by**: Shows administrator name
- **Date/Time**: Norwegian locale formatting (e.g., "15. mars 2025, 14:30")

#### Step-by-Step Remediation Guide
Numbered steps (1-2-3) with visual indicators:
1. Read feedback carefully and note required changes
2. Click "Edit" button to modify report
3. Resubmit when changes are complete

Each step has:
- Circular numbered badge (primary color)
- Clear instructional text
- Visual alignment for easy scanning

#### Help Section
- Info icon and styled paper component
- Contact guidance for users needing assistance
- Encourages reaching out to administrators

### 3. Action Buttons

#### On Report Card
- **Edit** (Outlined button) - Opens report for editing
- **Submit** (Contained button) - Submits for review
- **View Feedback** (Text button, error color) - Opens feedback dialog

#### In Feedback Dialog
- **Close** - Dismisses dialog
- **Edit Now** (Contained button) - Closes dialog and immediately opens report for editing

## User Flow

```
Rejected Report Card
  ↓
[Clickable Alert Banner]
  ↓
Feedback Dialog Opens
  ↓
User Reads Details
  ↓
User Clicks "Edit Now"
  ↓
Dialog Closes + Report Opens in Edit Mode
  ↓
User Makes Changes
  ↓
User Clicks "Submit"
  ↓
Report Resubmitted
```

## Technical Implementation

### State Management
```tsx
const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
const [selectedFeedbackReport, setSelectedFeedbackReport] = useState<any>(null);
```

### Key Functions
- `openFeedbackDialog(report)` - Opens dialog with report data
- `closeFeedbackDialog()` - Closes and resets dialog state
- `formatDateTime(dateStr)` - Norwegian locale date/time formatting

### Dialog Structure
- **maxWidth**: "md" (responsive)
- **fullWidth**: true
- **Dividers**: Separate header/content/actions
- **Responsive spacing**: Uses MUI Stack with spacing={3}

### Styling Highlights
- **Error tones**: Red borders and backgrounds for rejection info
- **Info tones**: Blue backgrounds for help section
- **Interactive cursor**: Pointer on clickable alert
- **Numbered badges**: Circular primary-colored step indicators
- **Proper typography hierarchy**: h6 → subtitle2 → body2 → caption

## Translation Keys

All text is internationalized using the `useTranslations` hook:

```typescript
case_reports.rejected_title - "Rapporten ble avslått"
case_reports.rejected_by - "Avslått av"
case_reports.click_details - "Klikk for å se detaljert tilbakemelding"
case_reports.view_feedback - "Se tilbakemelding"
case_reports.feedback_title - "Tilbakemelding på rapport"
case_reports.report_rejected - "Rapporten er avslått"
case_reports.rejection_explanation - Long explanation text
case_reports.rejection_reason - "Årsak til avslag"
case_reports.rejected_date - "Dato"
case_reports.next_steps - "Neste steg"
case_reports.step1/step2/step3 - Step instructions
case_reports.need_help - "Trenger du hjelp?"
case_reports.help_text - Help guidance text
case_reports.edit_now - "Rediger nå"
common.close - "Lukk"
```

## Design Patterns

### Material-UI Components Used
- Dialog + DialogTitle + DialogContent + DialogActions
- Alert + AlertTitle
- Paper (for highlighted sections)
- Stack (for consistent spacing)
- Box (for layout)
- Typography (for text hierarchy)
- IconButton (for close button)
- Divider (for section separation)

### Color Palette
- **Error**: Red tones for rejection info
- **Primary**: Blue for action buttons and step badges
- **Info**: Blue tones for help section
- **Text.secondary**: Gray for metadata

### Accessibility
- ✅ Semantic HTML structure
- ✅ ARIA labels via MUI components
- ✅ Keyboard navigation (dialog handles Escape key)
- ✅ Focus management (dialog traps focus)
- ✅ Color contrast (using theme colors)
- ✅ Clear visual hierarchy

## Backend Requirements

The feature expects these fields on rejected reports:

```typescript
{
  status: 'rejected',
  rejection_reason: string,        // Main feedback text
  rejected_by?: string,            // Administrator name
  rejected_at?: string | Date,     // ISO timestamp
}
```

### Database Schema
Already exists in `case_reports` table:
- `rejection_reason TEXT`
- `rejected_by TEXT`
- `rejected_at TIMESTAMP`

Set when admin rejects via Company Portal.

## Future Enhancements

### Phase 1 (Current) ✅
- Basic feedback display
- Step-by-step guide
- Edit action from dialog

### Phase 2 (Future)
- [ ] Rich text feedback with **bold** and *italic*
- [ ] Inline highlighting of specific report sections
- [ ] Threaded comments/conversation
- [ ] Notification when feedback is received
- [ ] Email notification with feedback summary

### Phase 3 (Advanced)
- [ ] React Quill integration for rich text editor
- [ ] Markup/annotation tools for admins
- [ ] Version history showing all feedback iterations
- [ ] Side-by-side diff view (original vs. revised)
- [ ] Attachment support (e.g., example documents)

## Testing Checklist

- [x] Dialog opens when clicking alert banner
- [x] Dialog opens when clicking "View Feedback" button
- [x] Close button dismisses dialog
- [x] Escape key dismisses dialog
- [x] Click outside dialog dismisses it
- [x] "Edit Now" closes dialog and opens editor
- [x] Date formatting works with Norwegian locale
- [x] Layout is responsive on mobile
- [ ] Works with various rejection_reason lengths
- [ ] Handles missing rejected_by gracefully (shows "Administrator")
- [ ] Handles missing rejected_at gracefully

## Related Files

- `frontend/app/case-reports/page.tsx` - Main implementation
- `frontend/app/portal/reports/page.tsx` - Admin side (where rejection happens)
- `PORTAL_IMPROVEMENTS.md` - Portal UI improvement tracker

## See Also

- Portal rejection workflow in `PORTAL_IMPROVEMENTS.md`
- Main app UI improvements in commit `3a73cc7`
- Portal Phase 2 improvements in commit `5487a7e`
