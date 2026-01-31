# Craft Cannabis Kiosk

A Windows desktop check-in kiosk application for Craft Cannabis dispensaries, integrated with POSaBIT POS system.

## Features

### Customer Check-In Methods
1. **Phone Number Lookup** - Enter 10-digit phone to find existing customer
2. **ID Scan (Driver's License)** - Scan PDF417 barcode on back of DL
   - Extracts: First Name, Last Name, DOB, DL Number
   - **Age Verification**: Automatically checks if 21+ and blocks underage
   - Looks up customer by name in local database
3. **Guest Entry** - Quick check-in without lookup

### ID Scan Features
- Parses AAMVA PDF417 barcode format (all US states)
- Displays: Name, DOB, Age, DL Number on screen
- Shows "Welcome Back!" if customer found in database
- Red warning screen if under 21

### Admin Panel
- Venue selection (6 Craft Cannabis locations)
- Customer search by phone number
- Sync status display (customer count, last sync time)
- Force full sync button
- Debug info (database stats)

### Technical Features
- **Offline-first**: Local SQLite database with 49k+ customers
- **Background sync**: Initial full sync, then incremental every 15 minutes
- **Secure API**: POSaBIT credentials stored in main process only
- **Kiosk mode**: Fullscreen, no window controls

## Project Structure

```
craft-cannabis-kiosk/
├── electron/
│   ├── main.ts              # Electron main process
│   ├── preload.cjs          # IPC bridge (CommonJS)
│   ├── config/
│   │   └── venues.ts        # 6 venue tokens
│   └── services/
│       ├── database.ts      # SQLite operations
│       ├── posabit.ts       # POSaBIT API client
│       └── sync.ts          # Customer sync logic
├── components/
│   ├── AdminPanel.tsx       # Admin settings & debug
│   ├── VenueSelector.tsx    # First-run venue picker
│   └── Kiosk/
│       ├── KioskHome.tsx    # Main check-in screen
│       ├── PhoneEntry.tsx   # Phone number input
│       ├── IDScan.tsx       # DL barcode scanner
│       ├── GuestEntry.tsx   # Guest check-in
│       └── QREntry.tsx      # QR code (placeholder)
├── services/
│   ├── kioskApi.ts          # Abstraction layer (Electron/Web)
│   └── posabit.ts           # Web fallback API
├── types.ts                 # TypeScript interfaces
└── App.tsx                  # Main app component
```

## Deployment

### Quick Deploy (Unpacked)
1. Copy the `release/win-unpacked/` folder to target computer
2. Run `Craft Cannabis Kiosk.exe`
3. Select venue on first launch
4. Wait for initial customer sync (~2-3 minutes for 49k customers)

### Database Location
`%APPDATA%/craft-cannabis-kiosk/customers.db`

## Development

### Start Dev Mode
```bash
npm run electron:dev
```

### Build for Production
```bash
npm run electron:build
```

## Hardware

### Tested Scanner
- Zebra DS9308 (PDF417 barcode scanner)
- Works in keyboard emulation mode

## Venues

| Location | ID |
|----------|-----|
| Craft Cannabis Tacoma | tacoma |
| Craft Cannabis Andresen | andresen |
| Craft Cannabis Leavenworth | leavenworth |
| Craft Cannabis Mill Plain | millPlain |
| Craft Cannabis South Wenatchee | southWenatchee |
| Craft Cannabis Wenatchee | wenatchee |

## Changelog

### v1.0.0 (January 2026)
- Phone number lookup with local SQLite
- ID scan with AAMVA PDF417 parsing
- Age verification (21+ check)
- Customer lookup by name from ID scan
- Admin panel with sync controls
- 6 venue support
- Offline queue support
- Background customer sync
