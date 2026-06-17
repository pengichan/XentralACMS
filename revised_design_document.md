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
* No account type dropdowns (Local vs AD) or prefix modifying operations (`.\`) are performed on usernames by the backend, ensuring clean username authentication.

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
