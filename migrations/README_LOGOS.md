# Company Logos - Database Storage

## Setup Complete ✅

The companies table has been created and the API endpoints are ready. The frontend now fetches company logos from the database instead of static files.

## Adding the Kinoa Logo

You have two options:

### Option 1: Use the seed script (Recommended)

1. **Save the Kinoa logo** to `frontend/public/kinoa-logo.png` (manually from the chat image)

2. **Run the seed script**:
   ```bash
   node migrations/seed-kinoa-logo.js
   ```

This will automatically:
- Read the PNG file
- Convert it to base64
- Store it in the database as a data URL
- Update the Kinoa company record

### Option 2: Manual API upload

If you prefer, you can use curl or Postman to upload:

```bash
# First, convert your image to base64
base64 -i frontend/public/kinoa-logo.png -o /tmp/logo-base64.txt

# Then POST to the API (replace <base64_string> with file content)
curl -X POST http://localhost:4000/api/companies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kinoa",
    "logo_base64": "data:image/png;base64,<base64_string>",
    "display_order": 1
  }'
```

## Adding More Companies

To add more companies with logos:

1. Add the company record to the database
2. Upload the logo using the seed script or API

Example for a new company:
```bash
# Assuming logo is at frontend/public/company-name-logo.png
node migrations/seed-company-logo.js "Company Name" "company-name-logo.png" 2
```

## Verify

After adding the logo, you can verify by:

1. Visiting the setup page
2. Typing "Kinoa" in the company field
3. The logo should appear with a fade-in effect

Or check via API:
```bash
curl http://localhost:4000/api/companies
```
