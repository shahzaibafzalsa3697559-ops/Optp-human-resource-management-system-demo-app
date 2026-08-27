# OPTP Human Resource Management System (Demo Version)

A responsive single-page web application designed for comprehensive employee lifecycle management, personnel record tracking, and document archiving[cite: 1, 2, 3]. 

This **Demo Version** is a standalone, self-contained implementation designed for client presentations, QA testing, and sandbox demonstrations without requiring external Google Cloud API credentials or active internet authentication.

---

## 🌟 Overview & System Highlights

* **100% Offline & Serverless:** Decoupled from Google OAuth 2.0 and Google Drive APIs, running entirely on client-side browser storage (`localStorage`).
* **Full Feature Parity:** Provides the exact user interface, validation rules, image compression workflows, and document management capabilities present in the production system[cite: 2, 3].
* **Two-Tier Security Simulation:** Implements a Master PIN authentication gate followed by a flexible mock email sign-in interface[cite: 3].
* **Zero Initial Bloat:** Ships with a completely fresh, empty database ready for new profile registrations.

---

## 🛠️ Architecture & Data Design

### 1. Authentication Layer
* **Security PIN Gate:** Access requires entering the application master PIN (`1234`)[cite: 3].
* **Mock Session Layer:** Allows authentication with any custom email (e.g., `demo.admin@gmail.com`) or 1-click **Instant Guest Login**[cite: 3].
* **Session Persistence:** Retains login state in browser storage to prevent logout on page refreshes[cite: 3].

### 2. Client-Side Database (`localStorage`)
Instead of Google Drive folders and files, data is structured into isolated JSON state partitions[cite: 3]:
* `optp_demo_active_employees`: Stores records of active workforce members.
* `optp_demo_archived_employees`: Stores records of resigned and retired staff members.
* `optp_demo_session`: Stores active user session metadata.

### 3. Record & Document Schema
Each employee record contains comprehensive organizational and personal parameters[cite: 3]:
* **Biographical Data:** Full Name, Father's Name, Date of Birth, 13-digit CNIC, Father's CNIC, Gender, Marital Status, Children Count[cite: 3].
* **Employment Details:** Job Position, Current Salary, Joining Date, Emergency Contact, Permanent & Temporary Addresses, Mobile Number, Email[cite: 3].
* **Academic & Background Checks:** Highest Qualification, Degree/Semester Details, Medical History, Crime Clearance Records[cite: 3].
* **Previous Employment Logs:** Previous Company Details, Past Salary, Reason for Leaving[cite: 3].
* **Compressed Attachments:** Base64-encoded profile photo, CNIC Front image, and CNIC Back image[cite: 3].

---

## 🚀 Key Modules & Capabilities

* **Interactive Dashboard:** Dynamic metric tiles displaying live counts for active staff and archived records with direct shortcut routing[cite: 3].
* **Comprehensive Registration Form:** Strict multi-field validation ensuring complete biographical and document collection prior to record creation[cite: 3].
* **Client-Side Image Compressor:** Integrated HTML5 Canvas engine automatically scales and compresses large images to lightweight Base64 JPEG strings, preventing storage overload[cite: 2, 3].
* **Live Dual-Query Search:** Instant filter searching simultaneously through employee full names and formatted or unformatted CNIC numbers[cite: 3].
* **Lifecycle State Transitions:** Move active personnel to Resigned/Retired status with exit dates and notes, or reactivate archived files back to the active directory with a single click[cite: 3].
* **Print & PDF Engine:** Generates an official, clean, print-optimized employee dossier complete with picture and CNIC previews ready for physical filing or digital export[cite: 3].

---

## 🔐 Credentials & Default Settings

| Parameter | Value |
| :--- | :--- |
| **Default Master PIN** | `1234`[cite: 3] |
| **Demo Login Email** | Any custom email (e.g., `demo.optp@gmail.com`)[cite: 3] |
| **Storage Engine** | Browser `localStorage` (Offline)[cite: 3] |
| **Technology Stack** | HTML5, CSS3 (Custom Variables), Pure Vanilla JavaScript (ES6+)[cite: 1, 2, 3] |

---

## 📁 File Structure

```text
├── index.html        # Main semantic entry structure
├── style.css         # Responsive UI design system & theme variables[cite: 1, 2]
├── app.js            # Offline demo engine & local storage controller[cite: 1, 3]
└── README.md         # Project documentation
