package router

import (
	"net/http"

	"xentral-acms-api/internal/controller"
	"xentral-acms-api/internal/dbproxy"
	"xentral-acms-api/internal/docs"
	"xentral-acms-api/internal/mail"

	"github.com/philippseith/signalr"
)

// New wires all API routes and returns the root mux.
func New(db dbproxy.DB, mailer *mail.Mailer) *http.ServeMux {
	mux := http.NewServeMux()

	health := controller.NewHealthController()
	imageType := controller.NewImageTypeController()
	userImage := controller.NewUserImageController()
	userPermission := controller.NewUserPermissionController()
	// Use DB-backed role controller so login role lookup works from SQL Server
	userRole := controller.NewUserRoleControllerDB(db)
	user := controller.NewUserController(db, mailer)

	server := controller.NewServerController(db)
	credential := controller.NewCredentialController(db)
	ticket := controller.NewTicketController(db)
	remote := controller.NewRemoteController(db)
	auditLog := controller.NewAuditLogController(db)
	report := controller.NewReportController(db)
	notification := controller.NewNotificationController(db)
	fileBox := controller.NewFileController(db)

	// Health
	mux.HandleFunc("GET /health", health.GetHealth)

	// Swagger docs
	mux.HandleFunc("GET /swagger", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/swagger/index.html", http.StatusMovedPermanently)
	})
	mux.HandleFunc("GET /swagger/index.html", docs.SwaggerUIHandler)
	mux.HandleFunc("GET /swagger/openapi.yaml", docs.OpenAPIHandler)

	// Image types
	mux.HandleFunc("GET /api/image-types", imageType.List)
	mux.HandleFunc("POST /api/image-types", imageType.Create)
	mux.HandleFunc("GET /api/image-types/{id}", imageType.GetByID)
	mux.HandleFunc("PUT /api/image-types/{id}", imageType.Update)
	mux.HandleFunc("DELETE /api/image-types/{id}", imageType.Delete)

	// User images
	mux.HandleFunc("GET /api/user-images", userImage.List)
	mux.HandleFunc("POST /api/user-images", userImage.Create)
	mux.HandleFunc("GET /api/user-images/{id}", userImage.GetByID)
	mux.HandleFunc("PUT /api/user-images/{id}", userImage.Update)
	mux.HandleFunc("DELETE /api/user-images/{id}", userImage.Delete)

	// User permissions
	mux.HandleFunc("GET /api/user-permissions", userPermission.List)
	mux.HandleFunc("POST /api/user-permissions", userPermission.Create)
	mux.HandleFunc("GET /api/user-permissions/{id}", userPermission.GetByID)
	mux.HandleFunc("PUT /api/user-permissions/{id}", userPermission.Update)
	mux.HandleFunc("DELETE /api/user-permissions/{id}", userPermission.Delete)

	// User roles (DB-backed)
	mux.HandleFunc("GET /api/user-roles", userRole.List)
	mux.HandleFunc("POST /api/user-roles", userRole.Create)
	mux.HandleFunc("GET /api/user-roles/{id}", userRole.GetByID)
	mux.HandleFunc("PUT /api/user-roles/{id}", userRole.Update)
	mux.HandleFunc("DELETE /api/user-roles/{id}", userRole.Delete)

	// Users
	mux.HandleFunc("GET /api/users", user.List)
	mux.HandleFunc("POST /api/users", user.Create)
	mux.HandleFunc("POST /api/users/login", user.Login)
	mux.HandleFunc("POST /api/users/logout", user.Logout)
	mux.HandleFunc("POST /api/auth/forgot-password", user.ForgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password-verify", user.ResetPasswordVerify)
	mux.HandleFunc("POST /api/auth/recover-account", user.RecoverAccount)
	mux.HandleFunc("GET /api/system/pending-counts", user.GetPendingCounts)
	mux.HandleFunc("POST /api/users/{id}/change-password", user.ChangePassword)
	mux.HandleFunc("POST /api/account-requests", user.RequestAccountSupport)
	mux.HandleFunc("GET /api/account-requests", user.ListAccountRequests)
	mux.HandleFunc("POST /api/account-requests/{id}/approve", user.ApproveAccountRequest)
	mux.HandleFunc("POST /api/account-requests/{id}/deny", user.DenyAccountRequest)
	mux.HandleFunc("GET /api/system/setup-status", user.GetSetupStatus)
	mux.HandleFunc("GET /api/system/host-ips", user.GetHostIPs)
	mux.HandleFunc("GET /api/system/smtp", user.ListSMTPProfiles)
	mux.HandleFunc("POST /api/system/smtp", user.CreateSMTPProfile)
	mux.HandleFunc("PUT /api/system/smtp/{id}", user.UpdateSMTPProfile)
	mux.HandleFunc("DELETE /api/system/smtp/{id}", user.DeleteSMTPProfile)
	mux.HandleFunc("POST /api/system/smtp/{id}/activate", user.ActivateSMTPProfile)
	mux.HandleFunc("POST /api/system/smtp/test", user.TestSMTPSettings)
	mux.HandleFunc("POST /api/debug/log", user.DebugLog)
	mux.HandleFunc("GET /api/system/settings", user.GetSystemSettings)
	mux.HandleFunc("PUT /api/system/settings", user.UpdateSystemSettings)
	mux.HandleFunc("GET /api/users/{id}", user.GetByID)
	mux.HandleFunc("PUT /api/users/{id}", user.Update)
	mux.HandleFunc("DELETE /api/users/{id}", user.Delete)
	mux.HandleFunc("PATCH /api/users/{id}/disable", user.Disable)
	mux.HandleFunc("PATCH /api/users/{id}/enable", user.Enable)
	mux.HandleFunc("PATCH /api/users/{id}/role", user.ChangeRole)

	// PAM Modules
	// Servers
	mux.HandleFunc("GET /api/servers", server.List)
	mux.HandleFunc("POST /api/servers", server.Create)
	mux.HandleFunc("POST /api/servers/scan-users", server.ScanUsers)
	mux.HandleFunc("GET /api/servers/{id}", server.GetByID)
	mux.HandleFunc("PUT /api/servers/{id}", server.Update)
	mux.HandleFunc("DELETE /api/servers/{id}", server.Delete)
	mux.HandleFunc("GET /api/assigned-servers", server.ListAssigned)

	// Credentials
	mux.HandleFunc("GET /api/credentials/{serverId}", credential.ListByServer)
	mux.HandleFunc("POST /api/credentials", credential.Create)
	mux.HandleFunc("PUT /api/credentials/{id}", credential.Update)
	mux.HandleFunc("DELETE /api/credentials/{id}", credential.Delete)
	mux.HandleFunc("POST /api/credentials/{id}/reveal", credential.Reveal)

	// Tickets — full CRUD + approve + deny
	mux.HandleFunc("GET /api/tickets", ticket.ListTickets)
	mux.HandleFunc("GET /api/tickets/{id}", ticket.GetTicketByID)
	mux.HandleFunc("POST /api/tickets/request", ticket.RequestAccess)
	mux.HandleFunc("POST /api/tickets/{id}/approve", ticket.ApproveTicket)
	mux.HandleFunc("POST /api/tickets/{id}/deny", ticket.DenyTicket)
	mux.HandleFunc("POST /api/tickets/grant", ticket.GrantAccess)
	mux.HandleFunc("POST /api/tickets/{id}/modify", ticket.ModifyAccess)

	// Remote / RDP
	mux.HandleFunc("GET /api/remote/{ticketId}", remote.GetRemoteAccessDetails)
	mux.HandleFunc("GET /api/remote-admin/connect", remote.GetRemoteAccessDetailsAdmin)
	mux.HandleFunc("GET /api/sessions", remote.ListSessions)
	mux.HandleFunc("POST /api/remote/sessions/close", remote.CloseSession)
	mux.HandleFunc("GET /api/remote/session-credentials", remote.GetSessionCredentials)
	mux.HandleFunc("POST /api/remote/generate-token", remote.GenerateSessionToken)

	// Audit Logs
	mux.HandleFunc("GET /api/audit-logs", auditLog.GetAuditLogs)
	mux.HandleFunc("DELETE /api/audit-logs", auditLog.ClearLogs)

	// Reports
	mux.HandleFunc("POST /api/reports/export", report.ExportReport)

	// Notifications & File Box (Using SignalR Hub)
	controller.InitSignalR()
	if controller.GlobalSignalRServer != nil {
		controller.GlobalSignalRServer.MapHTTP(signalr.WithHTTPServeMux(mux), "/api/system/events")
	}
	mux.HandleFunc("GET /api/notifications", notification.ListNotifications)
	mux.HandleFunc("POST /api/notifications/{id}/read", notification.MarkAsRead)
	mux.HandleFunc("DELETE /api/notifications", notification.ClearAll)
	mux.HandleFunc("GET /rdp-file-box", fileBox.ServeRDPFileBox)
	mux.HandleFunc("GET /api/files", fileBox.ListFiles)
	mux.HandleFunc("POST /api/files/upload", fileBox.UploadFile)
	mux.HandleFunc("GET /api/files/download/{id}", fileBox.DownloadFile)
	mux.HandleFunc("GET /api/files/base64/{id}", fileBox.GetFileBase64)
	mux.HandleFunc("DELETE /api/files/{id}", fileBox.DeleteFile)

	return mux
}

