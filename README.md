### 2. `README-DEMO.md` (Demo Version ke liye)

```markdown
# OPTP Employee Record System (Offline Demo Version)

A standalone offline demo of the OPTP Employee Record System designed for testing, client demonstrations, and local evaluation without external API dependencies.

## Architecture & Data Storage

* **Authentication:** Mock Sign-in allowing any custom/fake Gmail ID or 1-click Instant Guest Login.
* **Access Gate:** Demo Master PIN (`1234`).
* **Storage Engine:** Browser `localStorage` API for instant, persistent offline state simulation.
* **Initial State:** Clean, empty database ready for new profile registrations.

## Key Features

* **Zero External Dependencies:** Completely decoupled from Google OAuth and Google Drive APIs.
* **Full Feature Parity:** Supports all core capabilities including new registrations, record editing, status changes (Resigned/Retired), document uploads, and deletions.
* **Canvas Image Compression:** Compresses photo and CNIC uploads locally before storing in browser storage.
* **Search & Printable Dossier:** Real-time query filtering by Name/CNIC and fully styled printable record export.

## Setup & Usage

1. Open `index.html` (or your demo HTML file) ensuring it links to `app.js` (demo script) and `style.css`:
   ```html
   <link rel="stylesheet" href="style.css">
   <script src="app.js"></script>
