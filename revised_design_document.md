# XentralACMS Detailed Design Document (Revised)

## 1. Project Title
Design and Development of XentralACMS Enterprise Web Prototype for Privileged Server Access Management

## 2. Background
The customer requires an enterprise web prototype that provides the basic functions of a Privileged Access Management system for company Windows Servers. Existing commercial PAM solutions such as PAM360 provide many enterprise functions, but they are paid products and may include features that are not fully aligned with the customer’s specific internal workflow. At the same time, if the customer requires customised features, approval flows, UI layouts, or company-specific server access logic, a custom prototype gives more flexibility.

Therefore, XentralACMS is proposed as an internal web-based prototype to demonstrate how the company can manage server access requests, server credentials, approval workflow, browser-based RDP access, audit logs, and report export using a controlled and customisable platform.

The main purpose of XentralACMS is not to immediately replace a full commercial PAM product, but to provide a working enterprise prototype that can be adapted according to the customer’s needs.

## 3. Project Objective
The objective of XentralACMS is to develop an enterprise web prototype that allows:
* Users to log in and request access to company Windows Servers.
* Admins to manage server records, server credentials, and access tickets.
* Super Admins to manage users, admins, and overall system permissions.
* Users to connect to approved servers through browser-based RDP.
* The system to record all important actions in audit logs.
* Reports to be exported in selectable formats such as Excel, CSV, or PDF.

## 4. Customer Needs
The customer requires a system that can provide the minimum basic features of PAM360 while allowing customised features to be added based on actual company requirements.

The identified customer needs are:
* A central web portal to manage company Windows Server access.
* A User Module to manage login, user accounts, roles, and permissions.
* A Server List module to add, view, edit, and delete server information.
* A Server Credential module to store existing permitted server accounts securely.
* A ticket workflow where users raise access requests and admins approve or deny them.
* Browser-based RDP connection after approval.
* Audit logs to track login, server changes, credential actions, ticket actions, and remote access activity.
* Exportable reports for audit and review.
* A flexible UI that looks suitable for enterprise usage.
* A system design that can support additional features if the customer identifies new needs.

## 5. Reason for Building XentralACMS Instead of Directly Using PAM360
PAM360 is a commercial Privileged Access Management product. While it provides many mature PAM functions, the customer may not require all available modules or may need workflows that are specific to the company’s internal process.

The reasons for creating XentralACMS are:
* To reduce dependency on a paid commercial product for basic PAM-style functions.
* To create a prototype that can be customised to the customer’s workflow.
* To allow the company to add only the features it actually needs.
* To provide flexibility in UI design, approval flow, report format, and access logic.
* To allow internal learning and understanding of how PAM-style systems work.
* To build a controlled proof-of-concept before deciding whether a full product, custom system, or hybrid approach is more suitable.

XentralACMS focuses on the customer’s immediate needs: user management, server management, credential control, ticket approval, browser-based RDP, audit logging, and report export.

## 6. Scope of Work

### 6.1 In Scope
The prototype includes the following modules:
* Login Module
* User Management Module
* Dashboard Module
* Server List Module
* Server Details Module
* Server Credential Module
* Ticket Request Module
* Ticket Approval Module
* Browser-Based RDP Access Module
* Audit Log Module
* Report Export Module

### 6.2 Out of Scope for Initial Prototype
The following items are not part of the initial core prototype unless required later:
* Full replacement of commercial PAM360.
* Automatic password rotation.
* Full production-grade session recording.
* Full enterprise high availability setup.
* Complex multi-level approval workflow.
* Full Active Directory integration as the only login method.
* Password hashing for database-stored login credentials (plain-text checks are used for the prototype).

However, the design is kept flexible so that additional features can be added when required.

## 7. User Roles
XentralACMS supports three main roles.

### 7.1 Super Admin
The Super Admin is the highest-level account in the system.
Super Admin can:
* View dashboard.
* View all servers.
* Add, edit, and delete servers.
* Manage stored server credentials.
* View all tickets.
* Approve or deny tickets.
* View audit logs.
* Export reports.
* Create users.
* Disable users.
* Promote users to Admin.
* Downgrade Admins to Users.
* View all users and admins.
* Reveal or copy stored credentials only when required, with audit logging.

The default Super Admin account cannot be deleted, deactivated, or downgraded.

### 7.2 Admin
Admin is responsible for daily operation of server access management.
Admin can:
* View dashboard.
* View all servers.
* Add, edit, and delete server records.
* Add, edit, and delete server credentials.
* View all tickets.
* Approve or deny tickets.
* Select which existing server credential will be assigned to an approved ticket.
* View audit logs.
* Export reports.
* Create and disable normal users.

Admin cannot promote users to Admin. Only Super Admin can do that.

### 7.3 User
User is a normal system user who requires access to company servers.
User can:
* Log in to XentralACMS.
* View dashboard.
* View all available servers.
* View assigned or approved servers.
* Raise access tickets.
* View own ticket status.
* Connect to approved servers within the approved time window.
* View own access history.

User cannot:
* Add, edit, or delete servers.
* View server passwords.
* Select which credential to use.
* Approve or deny tickets.
* View other users’ tickets.
* Modify roles or permissions.

## 8. Overall System Architecture
The proposed system architecture is:
* **Frontend**: ReactJS
* **Backend API**: Go Language
* **Database**: SQL Server Express
* **Remote Access Gateway**: Browser-based RDP proxy (`mstsc.js` running on port 9250)

The frontend provides the enterprise web interface. The Go backend API handles business logic, authentication, role checking, ticket processing, credential handling, audit logging, and report generation. SQL Server Express stores users, roles, servers, credentials, tickets, logs, and reports.

For browser-based RDP, XentralACMS integrates with a remote desktop gateway. The user does not directly see the server password. When the ticket is approved, XentralACMS uses the assigned credential and generates a secure UUID token in Go which is saved in-memory. The frontend iframe connects using this token, preventing raw binary transmission issues.

## 9. Main Navigation Design

### 9.1 Super Admin / Admin View
The left-side navigation column contains:
* Dashboard
* Server List
* Tickets
* Credential Vault
* Audit Logs
* Reports
* User Management
* Settings

### 9.2 User View
The left-side navigation column contains:
* Dashboard
* Server List
* Assigned Servers
* My Requests
* My Access History

The UI is clean, responsive, and suitable for enterprise web usage.

## 10. Dashboard Design

### 10.1 Admin / Super Admin Dashboard
The dashboard shows:
* Total servers.
* Active users.
* Pending tickets.
* Approved tickets.
* Expired access.
* Recent access activity.
* Recent ticket activity.
* Recent audit events.

### 10.2 User Dashboard
The user dashboard shows:
* Total visible servers.
* Current approved access.
* Pending requests.
* Approved requests.
* Expired requests.
* Recent personal access activity.

## 11. Server List Module

### 11.1 Admin / Super Admin Server List
The Server List page shows all available servers.
The top right corner has an "Add Server" button.
The server table includes:
* Hostname
* IP Address
* OS Type
* Environment
* Remote Protocol
* Status
* Action Buttons (View, Edit, Delete)

### 11.2 Create Server
When Admin clicks Create, a popup appears with the title: Add New Server.
Fields: Hostname, IP Address, Environment, Location, OS Type, Remote Protocol, Status, Remarks, and optional User Scanning controls.

### 11.3 Edit Server
When Admin clicks Edit, a popup appears with the title: Edit Server. Existing details are displayed and editable.

### 11.4 Delete Server
When Admin clicks Delete, a confirmation popup appears: "Are you sure you want to delete this server? This cannot be undone." The server is soft-deleted after confirmation.

### 11.5 User Server List
Users can view all servers and request access to any server. Action buttons include View and Request Access. Users do not see Add, Edit, or Delete buttons.

## 12. Server Details Page
Double-clicking a server or selecting View opens the Server Details page.
The page contains four tabs: Overview, Credentials, Device Info, and Logs.

### 12.1 Overview Tab
Displays general hostname, IP address, OS type, environment, location, status, remote protocol, and remarks. It also shows a Credential Summary list. If the user has an approved active ticket, a Connect button is displayed.

### 12.2 Credentials Tab (Admins only)
Shows stored credentials linked to the selected server. The credential list includes Username, Secret Type, Secret Status, and Actions (Reveal, Delete). Passwords are masked by default. Normal users cannot view this tab.

### 12.3 Add Credential (Admins only)
Allows Admin to add a permitted server account username, password, and type (Password or SSH Key).

### 12.4 Device Info Tab
Shows detailed network and system metadata for the server.

### 12.5 Logs Tab (Admins only)
Shows logs related specifically to the selected server hostname (e.g. server created, credentials added, connection launched).

## 13. Ticket Module

### 13.1 User Ticket Request
Users raise tickets from the Server List page. The request popup includes Server Name, Urgency, Requested Start Time, Requested End Time, and Reason for Access. (Note: Access Type select field is excluded to match actual system implementation).

### 13.2 Admin Ticket View
Admin and Super Admin view all tickets. Tabs: All, Pending, Approved, Denied. Each ticket row displays: Server, Requested By, Urgency, Request Window, Reason, Status, and Date Submitted.

### 13.3 Ticket Approval
When approving a ticket, Admin selects one stored server credential. The approval popup includes: Start Access From, Duration (hours), Approved Until, and Assigned Server Credential. The system records who approved it, when, and which credential was assigned.

### 13.4 Ticket Denial
When denying a ticket, Admin must input a denial reason. The system records the decision, time, and reason.

## 14. Browser-Based RDP Access Module
Allows approved users to connect to Windows Servers through browser-based RDP.
* User raises ticket -> Admin approves and assigns server credential.
* During approved access period, user clicks "Connect" on the server.
* Backend generates a clean, random UUID token in Go and caches it in memory.
* Frontend launches browser-based RDP using the token by pointing an iframe to the `mstsc.js` proxy server.
* The proxy server queries the backend `/api/remote/session-credentials` with the token, gets RDP credentials, and initiates the connection.
* User accesses the desktop securely in-browser. Portal access is blocked after ticket expiry.

## 15. Credential Handling Design
* Normal users cannot view passwords. Passwords are masked by default.
* Super Admin can reveal/copy passwords, which is recorded in the audit log.
* Password credentials are stored encrypted in the database using a backend master key.
* Credentials of type 'Local' that do not already contain a backslash (\) are automatically prepended with `.\` by the RDP connector. This directs the domain-joined destination hosts to authenticate using their local SAM database rather than attempting Active Directory domain verification, solving authentication failures for local server accounts.

## 16. Audit Log Design
The Audit Log module records all important system actions.

### 16.1 Audit Log Columns
The `dbo.AuditLog` table includes:
* `LogID` (UNIQUEIDENTIFIER)
* `Timestamp` (DATETIME)
* `Actor` (NVARCHAR)
* `ActorRole` (NVARCHAR)
* `ActionType` (NVARCHAR)
* `TargetType` (NVARCHAR)
* `TargetName` (NVARCHAR)
* `ServerName` (NVARCHAR)
* `SourceIP` (NVARCHAR)
* `Result` (NVARCHAR)
* `Severity` (NVARCHAR)
* `Details` (NVARCHAR)

### 16.2 Audit Event Examples
The system logs login, logout, user deactivation, user role promotion, server additions/edits/deletions, credential additions/deletions, credential reveals, ticket submission, ticket approvals, ticket denials, and RDP session launches.

## 17. Report Export Module
XentralACMS allows reports to be exported in selectable formats (CSV, Excel, PDF).
Report types: Server Inventory, User List, Ticket History, Access History, Audit Logs, and Credential Inventory (without exposing passwords).
The export action is recorded in the audit log.

## 18. Database Design
The tables in the database are:

### 18.1 dbo.users Table
Stores XentralACMS user credentials and statuses.
Fields: `id`, `user_role_id`, `user_id`, `first_name`, `last_name`, `email`, `mobile_no`, `login_password`, `remark`, `last_login`, `is_active`, `is_deleted`, `created_date`, `updated_date`, `created_by`, `updated_by`

### 18.2 dbo.user_role Table
Stores system roles (Super Admin, Admin, User).
Fields: `id`, `role_name`, `description`, `is_deleted`, `created_date`, `updated_date`, `created_by`, `updated_by`

### 18.3 dbo.Server Table
Stores server inventory details.
Fields: `ID`, `Hostname`, `IPAddress`, `OSType`, `Description`, `IsActive`, `IsDeleted`, `CreatedDate`, `UpdatedDate`, `CreatedBy`, `UpdatedBy`, `Environment`, `Location`, `RemoteProtocol`, `ServerStatus`

### 18.4 dbo.Credential Table
Stores encrypted server connection credentials.
Fields: `ID`, `ServerID`, `Username`, `EncryptedPassword`, `SecretType`, `IsActive`, `IsDeleted`, `CreatedDate`, `UpdatedDate`, `CreatedBy`, `UpdatedBy`

### 18.5 dbo.Ticket Table
Stores access requests, approval states, and assigned credentials.
Fields: `ID`, `RequesterID`, `ApproverID`, `ServerID`, `Reason`, `Status`, `ValidUntil`, `IsDeleted`, `CreatedDate`, `UpdatedDate`, `CreatedBy`, `UpdatedBy`, `AssignedCredentialID`, `RequestedStartTime`, `RequestedEndTime`, `Urgency`

### 18.6 dbo.SessionAudit Table
Stores launched RDP session histories.
Fields: `ID`, `UserID`, `ServerID`, `TicketID`, `StartTime`, `EndTime`, `Protocol`, `ClientIP`

### 18.7 dbo.AuditLog Table
Stores all audit events.
Fields: `LogID`, `Timestamp`, `Actor`, `ActorRole`, `ActionType`, `TargetType`, `TargetName`, `ServerName`, `SourceIP`, `Result`, `Severity`, `Details`

### 18.8 dbo.ReportsExportHistory Table
Stores report generation history.
Fields: `ExportID`, `ExportedBy`, `ExportType`, `ExportFormat`, `ExportTime`, `Status`, `Details`

## 19. API Design
The backend API is developed using Go Language.

### 19.1 Authentication APIs
* `POST /api/users/login`
* `POST /api/users/logout`

### 19.2 User APIs
* `GET /api/users`
* `POST /api/users`
* `GET /api/users/{id}`
* `PUT /api/users/{id}`
* `DELETE /api/users/{id}`
* `PATCH /api/users/{id}/disable`
* `PATCH /api/users/{id}/enable`
* `PATCH /api/users/{id}/role`

### 19.3 Server APIs
* `GET /api/servers`
* `POST /api/servers`
* `POST /api/servers/scan-users`
* `GET /api/servers/{id}`
* `PUT /api/servers/{id}`
* `DELETE /api/servers/{id}`

### 19.4 Credential APIs
* `GET /api/credentials/{serverId}`
* `POST /api/credentials`
* `PUT /api/credentials/{id}`
* `DELETE /api/credentials/{id}`
* `POST /api/credentials/{id}/reveal`

### 19.5 Ticket APIs
* `GET /api/tickets`
* `GET /api/tickets/{id}`
* `POST /api/tickets/request`
* `POST /api/tickets/{id}/approve`
* `POST /api/tickets/{id}/deny`
* `POST /api/tickets/grant`
* `POST /api/tickets/{id}/modify`

### 19.6 Access & Remote APIs
* `GET /api/assigned-servers`
* `GET /api/remote/{ticketId}`
* `GET /api/remote-admin/connect`
* `GET /api/sessions`
* `POST /api/remote/sessions/close`
* `GET /api/remote/session-credentials`
* `POST /api/remote/generate-token`

### 19.7 Audit APIs
* `GET /api/audit-logs`
* `DELETE /api/audit-logs`

### 19.8 Report APIs
* `POST /api/reports/export`

## 20. Security Design
* Role-based access control.
* Masking of sensitive credential secrets.
* AES encryption of server credentials using a master key.
* System audit log entries recorded automatically on the backend.
* Session timeout and inactivity automatic logouts on the client.
* Verification of ticket approval time window on connection launch.
* Protected default Super Admin user account.

## 21. Implementation & Demonstration
The prototype is fully configured and ready for pilot testing. All workflows—including account administration, server cataloging, ticket authorization, and secure in-browser RDP execution via token-based handshake—are operational.

## 22. Email Notification & SMTP Routing Constraints (Local Development vs. Production)
For the prototype implementation, user account approvals and resets generate automated email notifications. However, during local development and pilot testing, a local **Mock Mode** (writing to `sent_emails.log`) is utilized instead of real-time external email dispatch. This approach is justified by corporate security policies and network routing constraints:

### 22.1 Authentication & MFA Policies (Local Restriction)
* **Disabled App Passwords**: Corporate security defaults enforce strict Multi-Factor Authentication (MFA) and block standard basic authentication (SMTP AUTH). The generation of App Passwords is disabled for standard corporate users (including interns) by tenant administrators.
* **Basic Authentication Deprecation**: Modern identity providers (such as Microsoft Entra ID) deprecate basic authentication (username/password login for SMTP) on port 587 to prevent credential harvesting.

### 22.2 Direct Send Routing Constraints
* **Internal Delivery Only**: Microsoft 365 Direct Send (connecting unauthenticated to the MX endpoint on port 25) only permits email delivery to mailboxes **within the same hosted tenant** (e.g. `@willowglen.com.sg`).
* **Anti-Spoofing & Relay Blocks**: Attempting to send unauthenticated emails to external domains (such as `@gmail.com`) is rejected by Microsoft servers with routing error `451 4.4.4 Mail received as unauthenticated` to prevent unauthorized mail relaying. Unauthenticated internal emails are also highly subject to Directory Based Edge Blocking (DBEB) or junk/quarantine filtering unless sent from an authorized network segment.

### 22.3 Production Migration Pathway
When transitioning the prototype to a production environment within the corporate network, email notification delivery will be enabled via one of the following official pathways:
1. **Exchange Online Inbound Connector**: The network administrator will configure an inbound connector whitelisting the application server's public/static IP. This enables secure, unauthenticated SMTP relaying to both internal and external recipients over port 25.
2. **Dedicated Internal Relay Service**: Routing mail through an existing internal corporate SMTP gateway that permits local server relaying without anti-spoofing flags.

## 23. Implemented Feature Extensions & Design Decisions
To elevate the utility and security of the prototype beyond the initial basic requirements, several key administrative and architectural features were introduced. These design decisions resolve functional gaps, improve security compliance, and streamline local system configuration:

### 23.1 Unified System Settings Dashboard
* **Initial State**: The settings page was a non-functional placeholder.
* **Design Decision**: Consolidated global system policies, database maintenance utilities, and email server setups under a single tabbed control center.
* **Key Features**:
  * **Session Timeout Controls**: A slide control to adjust the global session inactivity timeout limit in minutes.
  * **Password Validation Policies**: Administrative options to configure the minimum password length requirement and a toggle to enforce mandatory password changes upon first login.
  * **Audit Log Retention Controls**: An input to specify log retention length (in days) to govern future cleanups.
  * **System Maintenance Tools**: Relocated the "Clear Audit Logs" action from the general logs view to this settings panel to enforce proper administrative separation of duties.

### 23.2 Dynamic SMTP Multi-Profile Engine
* **Initial State**: Email settings were static, hardcoded, or limited to a single profile in config files.
* **Design Decision**: Implemented a database-backed, multi-profile SMTP manager that allows admins to maintain, test, and alternate between active email dispatchers dynamically without restarting the application.
* **Key Features**:
  * **Automated Presets Detection**: When entering standard emails (e.g. Gmail or Outlook), the frontend automatically detects the domain prefix and pre-fills SMTP hosts and ports to eliminate configuration complexity.
  * **Passwordless Direct-Send Relay Bypass**: Modified both backend SMTP drivers and frontend form rules to support blank username/password inputs. This enables direct, unauthenticated relays to corporate mail exchangers (Exchange Online) on port 25.
  * **In-App SMTP Tester**: A connection testing suite inside the settings dashboard to verify SMTP settings and receive test messages instantly.

### 23.3 Dynamic Inactivity Security Policy Sync
* **Initial State**: Session timeouts were hardcoded to 15 minutes on the client side.
* **Design Decision**: Integrated the React client-side idle tracking hooks with the backend configuration database.
* **Key Features**:
  * The frontend dynamically queries `GET /api/system/settings` upon initialization or login, loading the configured timeout minutes and passing them to the active session tracker, ensuring policy changes propagate instantly system-wide.

### 23.4 Client-Side Telemetry & Diagnostic Log Relay
* **Initial State**: Javascript runtime crashes in the browser were unrecorded, making remote troubleshooting difficult.
* **Design Decision**: Established a telemetry logging pipeline.
* **Key Features**:
  * Implemented a global React runtime error trap using `window.onerror` and `window.onunhandledrejection`.
  * Client exceptions (URLs, error messages, and stack traces) are caught and automatically POSTed to `/api/debug/log` on the Go backend, surfacing browser-side crashes directly within the server console log files.

### 23.5 Soft-Deleted Collision Indexing & Signup Validations
* **Initial State**: Deactivating or soft-deleting users kept their records in `dbo.users` with `is_deleted = 1`. However, global unique constraints on `email` and `user_id` prevented subsequent sign-up requests from reusing those credentials, leaving deleted accounts permanently blocking new users. Additionally, signup requests did not check for account existence at submission time, and deletions were always soft-deleted even if they had no references.
* **Design Decision**: Transitioned the database schema to active-only uniqueness validation, established entry-level email constraints for registration tickets, and added dynamic referential checks to choose between hard and soft deletion.
* **Key Features**:
  * Replaced the global `UNIQUE` constraint on `email` with a filtered non-clustered unique index (`WHERE is_deleted = 0`).
  * Updated the unique username trigger (`trg_users_user_id_unique`) and user creation controller endpoints to filter out soft-deleted users.
  * **Dynamic Soft-vs-Hard User Deletion**: Replaced the unconditional soft-deletion logic in the `Delete` handler. When a user is deleted, the backend dynamically checks if their unique ID or username is referenced in any related records or historical logs (including tickets, sessions, user images, and audit logs). If referenced, the user is soft-deleted (`is_deleted = 1`) to preserve historical integrity. If no references exist, they are completely hard-deleted (permanently removed from SQL Server) to keep the database clean.

### 23.6 Self-Service Password Recovery Flow
* **Design Decision**: Integrated a self-service password reset system using short-lived verification codes to allow users to verify their identity and reset their own password.
* **Key Features**:
  * **Secure Verification Table**: Auto-migrates and maintains `dbo.password_reset_codes` to store temporary recovery codes, email addresses, expiration times, and usage flags.
  * **Identity Verification**: Dispatches a secure 6-digit verification code to the user's email address (or backend console log when in mock mode) with a strict 15-minute expiration policy.
  * **Direct Reset**: Validates the active verification code and updates the user's password securely on successful validation, generating a medium-severity audit event.

### 23.7 Role-Based Settings Customizer (Personal Profile Settings)
* **Design Decision**: Restructured the Settings layout to expose a role-restricted Personal Settings panel to all platform users.
* **Key Features**:
  * **Profile Customizer**: Allows users to update their personal information (First Name, Last Name, Email, and Mobile No) which automatically updates their active session and user context.
  * **Self-Service Change Password**: Validates the user's current password before allowing password modifications to enforce security policies.
  * **Role Restriction**: Hides global system policies and email SMTP configuration tabs for standard users.

### 23.8 Local Account RDP Domain Bypass
* **Design Decision**: Auto-detects local server credentials and redirects authentication.
* **Key Features**:
  * Prepend `.\` prefix to the username when connecting to RDP if the credential's `accounttype` is `'Local'` and the username does not contain a backslash. This prevents domain-joined Windows servers from attempting Active Directory authentication on local accounts.

### 23.9 Real-Time Admin Notification Badges
* **Design Decision**: Configured a dynamic notification polling engine inside the main navigation shell.
* **Key Features**:
  * Queries `GET /api/system/pending-counts` every 10 seconds.
  * Displays dynamic red numeric notification badges on the admin navigation panel next to **Tickets** and **User Management** links for pending items.

### 23.10 RDP Connection Viewport Diagnostics & Error Overlay
* **Design Decision**: Implemented dynamic cross-origin HTML5 telemetry between the `mstsc.js` RDP proxy and the React frontend to report connection diagnostics directly within the parent window's loading overlay.
* **Key Features**:
  * **Rendering Telemetry (`rdp-bitmap`)**: Relays RDP canvas draw updates via `postMessage` to signify successful remote desktop authentication, delaying the transition from the loading screen to avoid flash-success false positives when a connection fails immediately post-connect.
  * **Connection Diagnostics & Mapping**: Listens to socket errors and translates complex errors (e.g. timeout, target offline, logon failure, permission denied, access restricted) into plain English alerts displayed inside the overlay.
  * **Disconnection Overlay & Viewport Close**: Automatically reinstates the loading/failure overlay on connection termination or unexpected session replacement (e.g., when another user logs in and terminates the current RDP token), providing a clean, styled "Close Viewport" button directly inside the parent window.

### 23.11 Passwordless Profile-Matching Account Recovery
* **Design Decision**: Implemented a passwordless identity matching mechanism for account username lookup and direct recovery resets.
* **Key Features**:
  * **No-Email Matcher (`POST /api/auth/recover-account`)**: Validates profile First Name, Last Name, and Email Address. On successful matching, returns the UserID (username).
  * **Direct Password Reset**: If a new password is typed and passes policy validation, it updates the user password directly, allowing instant self-service recovery without relying on SMTP or log file codes.

### 23.12 Server-Sent Events (SSE) Live Notification Hub
* **Design Decision**: Configured a Server-Sent Events (SSE) publisher/subscriber channel system in the Go backend.
* **Key Features**:
  * **Event Streaming Hub (`GET /api/system/events`)**: Streams `text/event-stream` channels to connect browsers with standard `EventSource` wrappers.
  * **Live Badge Push Alerts**: Broadcasts `pending_counts_update` whenever a ticket/account support request is submitted, approved, or denied. Connected client browsers instantly re-fetch count badge tallies without page refreshes.

### 23.13 Header 🔔 Notification Center & Dropdown
* **Design Decision**: Designed a glassmorphic top header bar containing a dynamic notification alert dropdown for real-time ticket alerts and quick actions.
* **Key Features**:
  * **Notification Database (`dbo.notifications`)**: Stores user-specific notifications and role-based group alerts (such as `ROLE_ADMIN`).
  * **Header Bell Dropdown Panel**: Admins see live ticket requests and can click **Approve** or **Deny** buttons directly within the notification list, calling backend approval endpoints natively.
  * **Real-time Synced Action State**: When a ticket or support request is approved or denied, the backend automatically updates matching notifications in the database to `is_read = 1`. The frontend bell panel listens to SSE `pending_counts_update` messages and automatically refetches notifications, immediately hiding Approve/Deny buttons for read items and maintaining real-time synchronization.
  * **Link Redirect Alignment**: Resolves navigation routing issues by mapping target links (like `/tickets` or `/tickets/:id`, `/assigned-servers`, `/account-requests`) to their proper active React Router paths (`/pam/tickets`, `/pam/assigned-servers`, `/pam/users`).

### 23.14 Audited Shared File Box Portal
* **Design Decision**: Established a secure shared file transfer utility inside XentralACMS.
* **Key Features**:
  * **Audited Uploads/Downloads**: Tracks file transfers in the database table `dbo.shared_files` and outputs High-severity `AuditLog` records for all uploads and downloads.
  * **Bi-directional RDP Copy-Paste Bypass**: Users can drop files from their local PC into the File Box web portal, and retrieve them by opening the portal browser inside the remote RDP desktop session (and vice versa).

### 23.15 Native RDP Client Launch & Clipboard Bypass
* **Design Decision**: Provided a native Remote Desktop Connection shortcut option for users experiencing screen lag or performance bottlenecks in the browser HTML5 canvas client.
* **Key Features**:
  * **Telemetry Propagated RDP File**: Propagates the generated `.rdp` connection profile dynamically down to the `BrowserRdpSession` component viewport.
  * **Control Bar Shortcut**: Adds a prominent "Download Native RDP" button directly onto the browser RDP viewport control bar, allowing users to transition to `mstsc.exe` with a single click.
  * **Clip-Copy Credentials**: Automatically saves the dynamically generated session password to the local clipboard when the `.rdp` file is downloaded, allowing instant login pasting.

### 23.16 Audited Shared File Box Retrieve/Send Workflow
* **Design Decision**: Outlined instructions for exchanging files between the local host PC and the target remote RDP desktop using the secure air-gapped web portal.
* **Key Features**:
  * **Sending to Target RDP PC**: Drag-drop or upload files into the "Shared File Box" in your local browser window. Once uploaded, log into the XentralACMS portal *inside* the RDP session's web browser, navigate to the Shared File Box tab, and click **Download** to retrieve it locally.
  * **Retrieving from Target RDP PC**: Inside the RDP session's browser, upload the desired file to the Shared File Box portal. Then, go to the Shared File Box page on your host PC's browser and click **Download** to save it to your local machine.
