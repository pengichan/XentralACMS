package controller

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"

	"orbit-acms-api/internal/utils"
)

type PendingSession struct {
	IPAddress      string
	Username       string
	Password       string
	CreatedAt      time.Time
	FirstFetchedAt time.Time
}

type RemoteController struct {
	db              *sql.DB
	pendingSessions sync.Map
}

func NewRemoteController(db *sql.DB) *RemoteController {
	// On server startup, close all orphaned sessions.
	// When the server restarts, all websocket/RDP proxy connections are lost,
	// so any session still marked as open (EndTime IS NULL) is stale.
	result, err := db.Exec(`UPDATE dbo.SessionAudit SET EndTime = GETUTCDATE() WHERE EndTime IS NULL`)
	if err == nil {
		if n, _ := result.RowsAffected(); n > 0 {
			log.Printf("[INIT] Closed %d orphaned session audit records", n)
		}
	}
	return &RemoteController{
		db: db,
	}
}

// GetRemoteAccessDetails validates a ticket and returns the decrypted credentials and server info
func (c *RemoteController) GetRemoteAccessDetails(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	ticketID := r.PathValue("ticketId")

	// 1. Validate the ticket
	var requesterID, serverID, status string
	var assignedCredentialID sql.NullString
	var validFrom, validUntil sql.NullTime
	err := c.db.QueryRow(`
		SELECT requesterid, CONVERT(VARCHAR(36), serverid) AS serverid, status, validfrom, validuntil, CONVERT(VARCHAR(36), assignedcredentialid) AS assignedcredentialid
		FROM dbo.Ticket
		WHERE id = @p1 AND isdeleted = 0
	`, ticketID).Scan(&requesterID, &serverID, &status, &validFrom, &validUntil, &assignedCredentialID)

	if err == sql.ErrNoRows {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if status != "Approved" {
		http.Error(w, "ticket is not approved", http.StatusForbidden)
		return
	}

	if validFrom.Valid && time.Now().UTC().Before(validFrom.Time) {
		http.Error(w, fmt.Sprintf("Your approved access window has not started yet. Active starting at %s.", validFrom.Time.Local().Format("2006-01-02 15:04:05")), http.StatusForbidden)
		return
	}

	if validUntil.Valid && time.Now().UTC().After(validUntil.Time) {
		http.Error(w, "ticket has expired", http.StatusForbidden)
		return
	}

	// Clean up stale sessions: close sessions whose associated ticket has expired
	_, _ = c.db.Exec(`
		UPDATE sa SET sa.EndTime = GETUTCDATE()
		FROM dbo.SessionAudit sa
		LEFT JOIN dbo.Ticket t ON t.id = sa.TicketID
		WHERE sa.EndTime IS NULL
		  AND (
		    (sa.TicketID IS NOT NULL AND t.validuntil IS NOT NULL AND t.validuntil < GETUTCDATE())
		    OR (sa.TicketID IS NULL AND sa.StartTime < @p1)
		  )
	`, time.Now().UTC().Add(-30*time.Minute))

	// 2. Get Server Info
	var ipAddress, hostname string
	err = c.db.QueryRow(`
		SELECT ipaddress, hostname
		FROM dbo.Server
		WHERE id = @p1 AND isdeleted = 0
	`, serverID).Scan(&ipAddress, &hostname)

	if err != nil {
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	// Check if another user already has an active session on this server
	var activeUser string
	err = c.db.QueryRow(`
		SELECT sa.UserID 
		FROM dbo.SessionAudit sa
		WHERE sa.ServerID = @p1 AND sa.EndTime IS NULL
	`, serverID).Scan(&activeUser)
	if err == nil {
		var details string
		if activeUser == requesterID {
			details = fmt.Sprintf("Active session for user %s on server %s was closed and replaced because the same user requested a new connection", activeUser, hostname)
		} else {
			details = fmt.Sprintf("Active session for user %s on server %s was terminated because a new connection was requested by user %s", activeUser, hostname, requesterID)
		}

		// Log the termination of the active user session
		_, _ = c.db.Exec(`
			INSERT INTO dbo.AuditLog (
				Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, ServerName, SourceIP, Result, Severity, Details
			) VALUES (
				@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11
			)
		`,
			time.Now().UTC(),
			"SYSTEM",
			"SYSTEM",
			"Session Kicked",
			"Server",
			hostname,
			hostname,
			"127.0.0.1",
			"Success",
			"Medium",
			details,
		)

		// Kick them by marking EndTime
		_, _ = c.db.Exec(`
			UPDATE dbo.SessionAudit
			SET EndTime = GETUTCDATE()
			WHERE ServerID = @p1 AND EndTime IS NULL
		`, serverID)
	}

	// 3. Get Credentials
	var encryptedPassword, username string
	if assignedCredentialID.Valid && assignedCredentialID.String != "" {
		err = c.db.QueryRow(`
			SELECT encryptedpassword, username
			FROM dbo.Credential
			WHERE id = @p1 AND isdeleted = 0 AND isactive = 1
		`, assignedCredentialID.String).Scan(&encryptedPassword, &username)
	} else {
		err = c.db.QueryRow(`
			SELECT TOP 1 encryptedpassword, username
			FROM dbo.Credential
			WHERE serverid = @p1 AND isdeleted = 0 AND isactive = 1
			ORDER BY createddate DESC
		`, serverID).Scan(&encryptedPassword, &username)
	}

	if err != nil {
		http.Error(w, "no active credentials found for this server", http.StatusNotFound)
		return
	}

	// 4. Decrypt Password
	decryptedPassword, err := utils.Decrypt(encryptedPassword, masterKey)
	if err != nil {
		http.Error(w, "failed to decrypt credentials", http.StatusInternalServerError)
		return
	}

	// 5. Audit log session access
	sessionID := uuid.New().String()
	_, err = c.db.Exec(`
		INSERT INTO dbo.SessionAudit (
			ID, UserID, ServerID, TicketID, StartTime, Protocol, ClientIP
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7
		)
	`, sessionID, requesterID, serverID, ticketID, time.Now().UTC(), "RDP", r.RemoteAddr)
	if err != nil {
		http.Error(w, "failed to audit session: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Cache connection details keyed by the session token
	c.pendingSessions.Store(sessionID, PendingSession{
		IPAddress: ipAddress,
		Username:  username,
		Password:  decryptedPassword,
		CreatedAt: time.Now(),
	})

	_, _ = c.db.Exec(`
		INSERT INTO dbo.AuditLog (
			Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, ServerName, SourceIP, Result, Severity, Details
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11
		)
	`,
		time.Now().UTC(),
		requesterID,
		"USER",
		"RDP Connection Launched",
		"Server",
		hostname,
		hostname,
		r.RemoteAddr,
		"Success",
		"Medium",
		fmt.Sprintf("User %s launched RDP connection to server %s (IP: %s) using approved ticket %s", requesterID, hostname, ipAddress, ticketID),
	)

	// 6. Generate .rdp file content
	rdpContent := fmt.Sprintf("full address:s:%s\nusername:s:%s\n", ipAddress, username)

	var validUntilStr string
	if validUntil.Valid {
		validUntilStr = validUntil.Time.Format(time.RFC3339)
	}

	response := map[string]string{
		"ipAddress":  ipAddress,
		"hostname":   hostname,
		"username":   username,
		"password":   decryptedPassword, // Sent securely over HTTPS, frontend can copy to clipboard
		"rdpFile":    rdpContent,
		"validUntil": validUntilStr,
		"token":      sessionID,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *RemoteController) ListSessions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	rows, err := c.db.Query(`
		SELECT 
			CONVERT(VARCHAR(36), sa.id) AS id, sa.userid, CONVERT(VARCHAR(36), sa.serverid) AS serverid, 
			CONVERT(VARCHAR(36), sa.ticketid) AS ticketid, sa.starttime, sa.endtime, sa.protocol, sa.clientip,
			s.hostname AS server_name
		FROM dbo.SessionAudit sa
		JOIN dbo.Server s ON s.id = sa.serverid
		WHERE sa.userid = @p1
		ORDER BY sa.starttime DESC
	`, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type SessionRecord struct {
		ID         string     `json:"id"`
		UserID     string     `json:"userId"`
		ServerID   string     `json:"serverId"`
		TicketID   string     `json:"ticketId"`
		StartTime  time.Time  `json:"startTime"`
		EndTime    *time.Time `json:"endTime,omitempty"`
		Protocol   string     `json:"protocol"`
		ClientIP   string     `json:"clientIp"`
		ServerName string     `json:"serverName"`
	}

	response := make([]SessionRecord, 0)
	for rows.Next() {
		var rec SessionRecord
		var endTime sql.NullTime
		var clientIP sql.NullString
		err := rows.Scan(
			&rec.ID, &rec.UserID, &rec.ServerID, &rec.TicketID,
			&rec.StartTime, &endTime, &rec.Protocol, &clientIP, &rec.ServerName,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if endTime.Valid {
			rec.EndTime = &endTime.Time
		}
		if clientIP.Valid {
			rec.ClientIP = clientIP.String
		}
		response = append(response, rec)
	}

	json.NewEncoder(w).Encode(response)
}

func (c *RemoteController) GetRemoteAccessDetailsAdmin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	serverId := r.URL.Query().Get("serverId")
	credentialId := r.URL.Query().Get("credentialId")
	userId := r.URL.Query().Get("userId")

	if serverId == "" || credentialId == "" || userId == "" {
		http.Error(w, "serverId, credentialId, and userId are required", http.StatusBadRequest)
		return
	}

	// 1. Check user role
	var roleName string
	err := c.db.QueryRow(`
		SELECT r.role_name
		FROM dbo.users u
		JOIN dbo.user_role r ON r.id = u.user_role_id
		WHERE u.id = @p1 AND u.is_deleted = 0 AND u.is_active = 1
	`, userId).Scan(&roleName)

	if err != nil {
		http.Error(w, "user not found or inactive", http.StatusNotFound)
		return
	}
	if roleName != "ADMIN" && roleName != "SUPER_ADMIN" {
		http.Error(w, "only Admins or Super Admins can connect directly", http.StatusForbidden)
		return
	}

	// Clean up stale sessions: close sessions whose associated ticket has expired
	_, _ = c.db.Exec(`
		UPDATE sa SET sa.EndTime = GETUTCDATE()
		FROM dbo.SessionAudit sa
		LEFT JOIN dbo.Ticket t ON t.id = sa.TicketID
		WHERE sa.EndTime IS NULL
		  AND (
		    (sa.TicketID IS NOT NULL AND t.validuntil IS NOT NULL AND t.validuntil < GETUTCDATE())
		    OR (sa.TicketID IS NULL AND sa.StartTime < @p1)
		  )
	`, time.Now().UTC().Add(-30*time.Minute))

	// 2. Fetch Server
	var ipAddress, hostname string
	err = c.db.QueryRow(`
		SELECT ipaddress, hostname
		FROM dbo.Server
		WHERE id = @p1 AND isdeleted = 0
	`, serverId).Scan(&ipAddress, &hostname)
	if err != nil {
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	// Check if another user already has an active session on this server
	var activeUser string
	err = c.db.QueryRow(`
		SELECT sa.UserID 
		FROM dbo.SessionAudit sa
		WHERE sa.ServerID = @p1 AND sa.EndTime IS NULL
	`, serverId).Scan(&activeUser)
	if err == nil {
		var details string
		if activeUser == userId {
			details = fmt.Sprintf("Active session for user %s on server %s was closed and replaced because the same user requested a new connection", activeUser, hostname)
		} else {
			details = fmt.Sprintf("Active session for user %s on server %s was terminated because a new connection was requested by user %s", activeUser, hostname, userId)
		}

		// Log the termination of the active user session
		_, _ = c.db.Exec(`
			INSERT INTO dbo.AuditLog (
				Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, ServerName, SourceIP, Result, Severity, Details
			) VALUES (
				@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11
			)
		`,
			time.Now().UTC(),
			"SYSTEM",
			"SYSTEM",
			"Session Kicked",
			"Server",
			hostname,
			hostname,
			"127.0.0.1",
			"Success",
			"Medium",
			details,
		)

		// Kick them by marking EndTime
		_, _ = c.db.Exec(`
			UPDATE dbo.SessionAudit
			SET EndTime = GETUTCDATE()
			WHERE ServerID = @p1 AND EndTime IS NULL
		`, serverId)
	}

	// 3. Fetch Credential
	var encryptedPassword, username string
	err = c.db.QueryRow(`
		SELECT encryptedpassword, username
		FROM dbo.Credential
		WHERE id = @p1 AND serverid = @p2 AND isdeleted = 0 AND isactive = 1
	`, credentialId, serverId).Scan(&encryptedPassword, &username)
	if err != nil {
		http.Error(w, "credential not found", http.StatusNotFound)
		return
	}

	// 4. Decrypt password
	decryptedPassword, err := utils.Decrypt(encryptedPassword, masterKey)
	if err != nil {
		http.Error(w, "failed to decrypt password", http.StatusInternalServerError)
		return
	}

	// 5. Audit Log session
	sessionID := uuid.New().String()
	_, err = c.db.Exec(`
		INSERT INTO dbo.SessionAudit (
			ID, UserID, ServerID, TicketID, StartTime, Protocol, ClientIP
		) VALUES (
			@p1, @p2, @p3, NULL, @p4, @p5, @p6
		)
	`, sessionID, userId, serverId, time.Now().UTC(), "RDP", r.RemoteAddr)
	if err != nil {
		http.Error(w, "failed to audit session: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Cache connection details keyed by the session token
	c.pendingSessions.Store(sessionID, PendingSession{
		IPAddress: ipAddress,
		Username:  username,
		Password:  decryptedPassword,
		CreatedAt: time.Now(),
	})

	_, _ = c.db.Exec(`
		INSERT INTO dbo.AuditLog (
			Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, ServerName, SourceIP, Result, Severity, Details
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11
		)
	`,
		time.Now().UTC(),
		userId,
		roleName,
		"Direct RDP Connection Launched",
		"Server",
		hostname,
		hostname,
		r.RemoteAddr,
		"Success",
		"High",
		fmt.Sprintf("Admin %s launched direct RDP connection to server %s (IP: %s) using credential %s", userId, hostname, ipAddress, username),
	)

	// 6. Return response
	rdpContent := fmt.Sprintf("full address:s:%s\nusername:s:%s\n", ipAddress, username)
	response := map[string]string{
		"ipAddress": ipAddress,
		"hostname":  hostname,
		"username":  username,
		"password":  decryptedPassword,
		"rdpFile":   rdpContent,
		"token":     sessionID,
	}

	json.NewEncoder(w).Encode(response)
}

func (c *RemoteController) CloseSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var payload struct {
		TicketID string `json:"ticketId"`
		ServerID string `json:"serverId"`
		UserID   string `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	if payload.TicketID != "" {
		_, err := c.db.Exec(`
			UPDATE dbo.SessionAudit
			SET EndTime = @p2
			WHERE TicketID = @p1 AND EndTime IS NULL
		`, payload.TicketID, now)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else if payload.ServerID != "" && payload.UserID != "" {
		_, err := c.db.Exec(`
			UPDATE dbo.SessionAudit
			SET EndTime = @p3
			WHERE ServerID = @p1 AND UserID = @p2 AND EndTime IS NULL
		`, payload.ServerID, payload.UserID, now)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		http.Error(w, "ticketId or (serverId and userId) required", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

func (c *RemoteController) GetSessionCredentials(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "token is required", http.StatusBadRequest)
		return
	}

	val, ok := c.pendingSessions.Load(token)
	if !ok {
		http.Error(w, "invalid or expired session token", http.StatusUnauthorized)
		return
	}
	session := val.(PendingSession)

	if time.Since(session.CreatedAt) > 60*time.Second {
		c.pendingSessions.Delete(token)
		http.Error(w, "session token has expired", http.StatusUnauthorized)
		return
	}

	// Grace period to handle React/browser double loading of iframe
	if !session.FirstFetchedAt.IsZero() {
		if time.Since(session.FirstFetchedAt) > 15*time.Second {
			c.pendingSessions.Delete(token)
			http.Error(w, "session token has expired", http.StatusUnauthorized)
			return
		}
	} else {
		// First time accessing the token: store the timestamp
		session.FirstFetchedAt = time.Now()
		c.pendingSessions.Store(token, session)
	}

	json.NewEncoder(w).Encode(map[string]string{
		"ipAddress": session.IPAddress,
		"username":  session.Username,
		"password":  session.Password,
	})
}

func (c *RemoteController) GenerateSessionToken(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var payload struct {
		IPAddress string `json:"ipAddress"`
		Username  string `json:"username"`
		Password  string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	if payload.IPAddress == "" || payload.Username == "" || payload.Password == "" {
		http.Error(w, "ipAddress, username, and password are required", http.StatusBadRequest)
		return
	}

	// Generate secure token (random UUID)
	token := uuid.New().String()

	c.pendingSessions.Store(token, PendingSession{
		IPAddress: payload.IPAddress,
		Username:  payload.Username,
		Password:  payload.Password,
		CreatedAt: time.Now(),
	})

	json.NewEncoder(w).Encode(map[string]string{
		"token": token,
	})
}
