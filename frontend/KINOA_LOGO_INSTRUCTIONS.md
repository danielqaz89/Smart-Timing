# Kinoa Tiltak AS Integration

## Company Information (Verified from BRREG)

- **Name**: KINOA TILTAK AS
- **Org.nr**: 921314582
- **Type**: Aksjeselskap (AS)
- **Address**: Eplehagen 2, 1424 SKI
- **Municipality**: NORDRE FOLLO
- **Industry**: Forebyggende helsearbeid (86.992)
- **Employees**: 39
- **Verified**: 2025-11-03

## Logo Setup

To display the Kinoa logo in the setup form, you need to add the logo image file.

### Steps:

1. Save the Kinoa logo image (the one with blue "Kinoa" text and tagline "Bolig • Familietiltak • Miljøarbeider • Tur/Avlastning") to:
   ```
   frontend/public/kinoa-logo.png
   ```

2. The logo will automatically appear when:
   - User types or selects a company name containing "Kinoa" (case-insensitive)
   - Default value "Kinoa Tiltak AS" is selected

3. The logo displays:
   - Centered in the setup form
   - With a smooth fade-in animation
   - Above the form fields
   - Max width: 300px
   - Max height: 150px
   - Responsive scaling

### Supported Formats:
- PNG (recommended)
- JPG/JPEG
- WebP

### Recommended Image Specs:
- Transparent background (PNG)
- High resolution (2x for retina displays)
- Aspect ratio preserved

## Current Implementation

The logo appears in `/app/setup/page.tsx` when `form.bedrift.toLowerCase().includes('kinoa')` is true.

To change the detection logic or logo dimensions, edit lines 94-117 in `app/setup/page.tsx`.
