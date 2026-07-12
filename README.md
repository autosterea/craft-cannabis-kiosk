# Craft Cannabis Kiosk

Windows desktop application for customer check-in at Craft Cannabis retail locations. Built with Electron, React, and SQLite.

## June 24, 2026 Call Pointer

Canonical app-by-app call notes live in root `WORKSPACE_STATUS.md`.

Kiosk status from the June 24 call: stable, no new issues raised this week. Confirm carried-over items from the prior week only: guest screen auto-timeout, scan button/reset behavior, and scan-ID pane placement if those were not already shipped. DopeTech/product-review work is tracked outside the kiosk unless explicitly requested.

## Features

- **Multi-venue support** - All 5 Craft Cannabis locations with venue selector
- **Offline-first** - Local SQLite database with background sync
- **Driver's License scanning** - AAMVA PDF417 barcode support for fast check-in
- **POSaBIT integration** - Real-time queue management and customer lookup
- **Auto-updates** - Automatic updates via GitHub releases
- **Kiosk mode** - Fullscreen, frameless window for dedicated kiosk hardware

## Supported Venues

| Venue | Location |
|-------|----------|
| Craft Cannabis Tacoma | Tacoma, WA |
| Craft Cannabis Andresen | Vancouver, WA |
| Craft Cannabis Mill Plain | Vancouver, WA |
| Craft Cannabis Wenatchee South | Wenatchee, WA |
| Craft Cannabis Wenatchee North | Wenatchee, WA |

## Check-in Flows

### ID Scan (Driver's License)
1. Customer scans DL barcode
2. System extracts: name, DOB, address, gender
3. Lookup by name in local database
4. **If found (existing customer):**
   - Prompt for loyalty signup if not a member
   - Update demographics from DL regardless of loyalty choice
   - Add to POSaBIT queue
5. **If not found:**
   - Create new customer with DL demographics
   - Add to POSaBIT queue as new customer

### Guest Entry (Manual)
1. Customer enters first and last name
2. Prompt for loyalty signup
3. **If loyalty signup:**
   - Option to scan DL for easy data entry
   - Or manually enter phone and email
   - Create customer in POSaBIT
4. **If no loyalty:**
   - Add to queue as guest (no customer record created)

## Architecture

\
## Database

**Location:** 
### Tables

\
### Sync Behavior

- **First launch:** Full sync of all customers (~20k records, runs in background)
- **Subsequent launches:** Incremental sync using - **Periodic refresh:** Every 15 minutes (incremental only)
- **Offline queue:** Stores check-ins when offline, syncs when back online

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Windows (for building Windows installer)

### Setup

\
> craft-cannabis-kiosk@1.1.0 electron:rebuild
> electron-rebuild -f -w better-sqlite3
### Run Development Mode

\
This starts Vite dev server and Electron concurrently with hot reload.

### Build Installer

\
Output: 
## Testing (mandatory before release)

Runtime test suites live in `tests/runtime/` and run against the **built** renderer (`dist/`) in real Chrome with a mocked `window.kiosk`:

- `scan-safety.test.cjs` — guards against the v2.1.14 wrong-account incident (2026-07-11): asserts short numeric input on the always-on HOME scanner and the ID Scan screen NEVER checks anyone in; the Dope/loyalty QR works only on the opt-in QR Code Entry screen; DL barcode flows are intact. 12 assertions.
- `checkin-guards.test.cjs` — the v2.1.13 guarantees: no fake "checked in" card when POSaBIT didn't queue the customer, phone carry-over from the Phone screen, and no stale-phone PII bleed between customers. 12 assertions.

Run locally:

```
npm run build
npm run test:runtime
```

Requires a local Chrome install (`CHROME_PATH` env overrides `C:\Program Files\Google\Chrome\Application\chrome.exe`).

`npm run release` runs this gate automatically and **refuses to publish** if any assertion fails. `SKIP_RUNTIME_TESTS=1` bypasses it — only for when the gate itself is broken, never to save time.

### Scanner-input safety rule (do not regress)

Two production incidents came from changes to the scan path:

1. **v2.1.9 (June 2026):** a button prompt inserted between ID scan and queue-add froze kiosks at two stores. The ID-scan check-in must stay instant and hands-free; every mid-check-in screen needs an auto-timeout.
2. **v2.1.14 (July 2026):** the always-on home scanner accepted any 4-12 digit number as a POSaBIT customer id and silently checked in whoever owned it. Wrong customers got checked in from stray typed/scanned digits.

The rule: **an always-on input may only auto-act on high-entropy, format-validated data** (AAMVA DL barcodes, 100+ chars). Anything short or ambiguous (numeric ids, phone numbers) must require an explicit opt-in screen the customer navigates to. If you add a new barcode/QR type, add a scan-safety test proving stray input can't trigger it from Home or ID Scan.

## Releasing Updates

### Manual Release

1. Update version in 2. Build the installer:
   \3. Create GitHub release:
   \
### Auto-Update Mechanism

The app checks for updates on launch via GitHub releases:

1. App starts -> checks GitHub releases
2. If newer version found -> downloads in background
3. Prompts user to restart to apply update
4. Update installs on next launch

## Installation on Kiosk

### Download Installer

Go to: https://github.com/autosterea/craft-cannabis-kiosk/releases/latest

### First Launch

1. Run the installer (one-click install)
2. App launches in kiosk mode (fullscreen)
3. Select venue from dropdown
4. Initial customer sync starts in background
5. Ready to check in customers

### Kiosk Hardware Requirements

- Windows 10/11
- Touchscreen display (recommended)
- USB barcode scanner (keyboard mode)
- Internet connection

## Scanner Configuration

The app supports any USB barcode scanner in **keyboard mode** (HID). The scanner should be configured to:

1. Output as keyboard input (default for most scanners)
2. Add Enter/Return suffix after scan (most scanners do this by default)

### Supported Barcodes

- **Driver's License:** AAMVA PDF417 (back of license)
- **Invalid barcodes:** Front of license, store barcodes, etc. show error message

### Barcode Fields Extracted

| Field | AAMVA Code | Example |
|-------|------------|---------|
| First Name | DAC | JOHN |
| Last Name | DCS | DOE |
| Address | DAG | 123 MAIN ST |
| City | DAI | SEATTLE |
| State | DAJ | WA |
| ZIP Code | DAK | 98101 |
| Date of Birth | DBB | 01011990 |
| Gender | DBC | 1 (Male) / 2 (Female) |

## API Integration

### POSaBIT API v3

Base URL: 
**Authentication:**
- Integrator Token (header): - Venue Token (header): 
**Endpoints Used:**
- \ - List/search customers
- \ - Create customer
- \ - Update customer
- \ - Add to check-in queue

## Troubleshooting

### App won't start
- Check Windows Event Viewer for errors
- Delete \ and reinstall

### Scanner not working
- Ensure scanner is in keyboard mode
- Test scanner in Notepad first
- Check USB connection

### Sync issues
- Check internet connection
- View sync status in app header
- Database location: 
### Update not installing
- Check GitHub releases page is accessible
- Manually download and run installer

## Version History

Current version: **v2.1.15** (2026-07-11) — hotfix reverting v2.1.14's home-scanner numeric acceptance (wrong-account check-ins). Full history since v1.1.0 lives on the [GitHub releases page](https://github.com/autosterea/craft-cannabis-kiosk/releases).

### v1.1.0
- Fixed DL barcode parsing for address fields
- Added invalid barcode detection with visual guide
- DL demographics now saved even when declining loyalty
- New customers created from DL scan (not just lookup)
- Added DL scan option during guest loyalty signup
- Removed debug code for production

### v1.0.0
- Initial release
- Multi-venue support
- ID scanning and guest entry
- POSaBIT integration
- Auto-updates via GitHub

## License

Proprietary - Craft Cannabis / Autosterea

## Support

For issues or feature requests, contact the development team or create an issue at:
https://github.com/autosterea/craft-cannabis-kiosk/issues
