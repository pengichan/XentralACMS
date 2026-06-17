# Xentral ACMS - Privileged Server Access Management Portal

Xentral ACMS is an enterprise Privileged Access Management (PAM) web prototype designed to manage, authorize, and audit user access to company Windows Servers. 

The portal consolidates administrative controls, secure browser-based RDP iframe connections, credential vaults, and system settings (session timeouts, password complexity rules, logs retention) under a unified dashboard.

---

## 🚀 Technology Stack
* **Frontend**: ReactJS (Vite, Vanilla CSS styling, responsive layout, dynamic inactivity tracker)
* **Backend**: Go (HTTP ServeMux API, Microsoft SQL Server driver, dynamic SMTP engine, telemetry logging)
* **Database**: Microsoft SQL Server (schema definitions, trigger validations, relational seeds)
* **Gateway**: `mstsc.js` node proxy (HTML5 remote desktop protocol streamer)

---

## 📁 System Architecture
1. **Approval Workflow**: A user requests server access via a ticket. An administrator approves the request, assigning a specific server credential and defining the access duration windows.
2. **Secure Token Handshake**: During the approved access period, clicking "Connect" triggers the Go backend to generate a clean, cryptographically secure UUID token in-memory.
3. **HTML5 RDP Stream**: The frontend launches a browser connection inside an iframe pointing to the `mstsc.js` gateway. The gateway queries the backend's `/api/remote/session-credentials` with the token, retrieves the connection parameters, and initiates the RDP session. **Passwords are never exposed to the client browser.**

---

## 🛠️ Step-by-Step Installation & Setup

### 1. Database Installation (SQL Server)
1. Create a blank database named `XentralACMS` in your SQL Server instance.
2. Navigate to `BackEnd/API/GO/xentral-acms-api/internal/data/` and execute the following SQL scripts in numerical order to build tables, constraints, triggers, and default seeds:
   * `01_CreateTable.sql` (Applies tables, unique trigger, and active filtered index)
   * `02_InsertUserRole.sql`
   * `03_InsertUserPermission.sql`
   * `04_InsertImageType.sql`
   * `05_InsertUsers.sql` (Seeds default `admin`/`admin` account with Super Admin role)
   * `06_InsertUserImage.sql`
   * `07_CreatePAMTables.sql` (Creates servers, credentials, tickets, sessions)
   * `08_CreateAuditAndReportTables.sql`
   * `10_AddAssignedCredentialToTicket.sql`
   * `11_AddMissingServerAndTicketColumns.sql`
   * `12_CreateSettingsTables.sql` (Creates and seeds system settings and SMTP profiles)

---

### 2. Go Backend Configuration & Launch
1. Open `BackEnd/API/GO/xentral-acms-api/appsetting.config` in your editor.
2. Under the `[database]` section, configure your SQL Server login credentials:
   ```ini
   [database]
   host=localhost
   port=1433
   name=XentralACMS
   username=your_db_username
   password=your_db_password
   connection_string=sqlserver://your_db_username:your_db_password@localhost:1433?database=XentralACMS&encrypt=disable
   ```
3. Open a terminal, navigate to `BackEnd/API/GO/xentral-acms-api/` and run:
   ```bash
   go mod tidy
   go run .
   ```
   *The API server will launch and listen on `http://localhost:8080`.*

---

### 3. React Frontend Configuration & Launch
1. Navigate to the frontend directory `FrontEnd/WEB/ReactJS/xentral-acms-web/`.
2. Install the necessary node modules:
   ```bash
   npm install
   ```
3. Launch the development server:
   ```bash
   npm run dev
   ```
   *The frontend application will boot and open on `http://localhost:5173`.*

---

### 4. Remote Desktop Proxy Gateway Setup
The HTML5 RDP gateway streamer translates RDP protocols to canvas rendering in the browser:
1. Ensure node dependencies are installed in the gateway root.
2. Run the `mstsc.js` proxy:
   ```bash
   node node_modules/mstsc.js/server.js
   ```
   *The gateway will listen for websocket connections on port `9250`.*

---

## 🔑 Default Sign-in Credentials
Upon initial database seeding, log in with the following default Super Admin account to perform configurations:
* **Username**: `admin`
* **Password**: `admin`
* **Default URL**: `http://localhost:5173`

---

## ✉️ SMTP & Email Notification Testing
1. **Mock Development Mode (Default)**:
   * When SMTP is set to `Enabled: false` inside Settings, all emails (approvals, password resets, signup support) are logged directly to the local log file: `BackEnd/API/GO/xentral-acms-api/sent_emails.log`.
   * Open this file to immediately inspect output and retrieve temporary passwords during registration approvals.
2. **MFA and Authentication Limits**:
   * Corporate accounts with strict Multi-Factor Authentication (MFA) do not permit basic password-based SMTP client submission. Ensure App Passwords are created or configure an **Exchange Inbound Connector** on port 25 to send unauthenticated corporate emails in production.
   * Exchange Online's unauthenticated **Direct Send** only permits delivering mail to recipient domains hosted inside the same tenant (e.g. `@yourcompany.com`). Relaying unauthenticated mail to external addresses (like Gmail) will be rejected.

