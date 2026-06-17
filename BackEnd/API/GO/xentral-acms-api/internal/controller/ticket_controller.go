package controller

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"xentral-acms-api/internal/model"
)

type TicketController struct {
	db *sql.DB
}

func NewTicketController(db *sql.DB) *TicketController {
	// Auto-migrate ValidFrom column if it doesn't exist
	_, _ = db.Exec(`
		IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Ticket]') AND name = N'ValidFrom')
		BEGIN
			ALTER TABLE [dbo].[Ticket] ADD [ValidFrom] DATETIME NULL;
		END
	`)
	return &TicketController{
		db: db,
	}
}

func (c *TicketController) RequestAccess(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload model.Ticket
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(payload.RequesterID) == "" || strings.TrimSpace(payload.ServerID) == "" || strings.TrimSpace(payload.Reason) == "" {
		http.Error(w, "requesterId, serverId, and reason are required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	payload.CreatedDate = now
	payload.UpdatedDate = now
	payload.Status = "Pending"
	payload.IsDeleted = false

	row := c.db.QueryRow(`SELECT CONVERT(VARCHAR(36), NEWID())`)
	if err := row.Scan(&payload.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err := c.db.Exec(`
		INSERT INTO dbo.Ticket (
			id, requesterid, serverid, reason, status, isdeleted, createddate, updateddate, requestedstarttime, requestedendtime, accesstype, urgency
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12
		)
	`,
		payload.ID,
		payload.RequesterID,
		payload.ServerID,
		payload.Reason,
		payload.Status,
		payload.IsDeleted,
		payload.CreatedDate,
		payload.UpdatedDate,
		nullIfTimeZero(payload.RequestedStartTime),
		nullIfTimeZero(payload.RequestedEndTime),
		nullIfEmpty(payload.AccessType),
		nullIfEmpty(payload.Urgency),
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payload)
}

func (c *TicketController) ApproveTicket(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload struct {
		ApproverID           string  `json:"approverId"`
		Duration             float64 `json:"durationHours"`
		AssignedCredentialID string  `json:"assignedCredentialId"`
		ValidUntil           string  `json:"validUntil"`
		ValidFrom            string  `json:"validFrom"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	if payload.ApproverID == "" {
		http.Error(w, "approverId is required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	validFrom := parseValidUntil(payload.ValidFrom, 0, now)
	validUntil := parseValidUntil(payload.ValidUntil, payload.Duration, validFrom)

	result, err := c.db.Exec(`
		UPDATE dbo.Ticket
		SET status = 'Approved', approverid = @p2, validfrom = @p3, validuntil = @p4, assignedcredentialid = @p5, updateddate = @p6
		WHERE id = @p1 AND status = 'Pending' AND isdeleted = 0
	`, id, payload.ApproverID, validFrom, validUntil, nullIfEmpty(payload.AssignedCredentialID), now)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if rowsAffected == 0 {
		http.Error(w, "ticket not found or already processed", http.StatusNotFound)
		return
	}

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	auditLogger.LogEvent(
		payload.ApproverID,
		"Admin", // Assuming Admin based on route
		"Approve Ticket",
		"Ticket",
		id,
		"", // ServerName not immediately known here without another query, but we can leave blank for now
		r.RemoteAddr,
		"Success",
		"Info",
		"Ticket approved until "+validUntil.Format(time.RFC3339),
	)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":    "Ticket approved successfully",
		"validUntil": validUntil,
	})
}

func (c *TicketController) DenyTicket(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload struct {
		ApproverID string `json:"approverId"`
		Reason     string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	if payload.ApproverID == "" || payload.Reason == "" {
		http.Error(w, "approverId and reason are required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	result, err := c.db.Exec(`
		UPDATE dbo.Ticket
		SET status = 'Rejected', approverid = @p2, updateddate = @p3
		WHERE id = @p1 AND status = 'Pending' AND isdeleted = 0
	`, id, payload.ApproverID, now)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if rowsAffected == 0 {
		http.Error(w, "ticket not found or already processed", http.StatusNotFound)
		return
	}

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	auditLogger.LogEvent(
		payload.ApproverID, "Admin", "Deny Ticket", "Ticket", id, "",
		r.RemoteAddr, "Success", "Warning",
		"Ticket denied. Reason: "+payload.Reason,
	)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Ticket denied"})
}

func (c *TicketController) ListTickets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	statusFilter := r.URL.Query().Get("status")
	requesterFilter := r.URL.Query().Get("requesterId")

	query := `
		SELECT
			CONVERT(VARCHAR(36), t.id) AS id,
			t.requesterid, ISNULL(t.approverid, '') AS approverid,
			CONVERT(VARCHAR(36), t.serverid) AS serverid,
			t.reason, t.status,
			t.validfrom AS validfrom,
			t.validuntil AS validuntil,
			CONVERT(VARCHAR(36), t.assignedcredentialid) AS assignedcredentialid,
			t.isdeleted, t.createddate, t.updateddate,
			ISNULL(s.hostname, '') AS hostname,
			t.requestedstarttime, t.requestedendtime,
			ISNULL(t.accesstype, '') AS accesstype,
			ISNULL(t.urgency, '') AS urgency
		FROM dbo.Ticket t
		LEFT JOIN dbo.Server s ON s.id = t.serverid AND s.isdeleted = 0
		WHERE t.isdeleted = 0
	`
	args := []interface{}{}
	pIdx := 1

	if statusFilter != "" {
		query += " AND t.status = @p" + string(rune('0'+pIdx))
		args = append(args, statusFilter)
		pIdx++
	}
	if requesterFilter != "" {
		query += " AND t.requesterid = @p" + string(rune('0'+pIdx))
		args = append(args, requesterFilter)
		pIdx++
	}
	query += " ORDER BY t.createddate DESC"

	rows, err := c.db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type TicketView struct {
		model.Ticket
		Hostname   string `json:"hostname"`
		ValidFrom  string `json:"validFromStr,omitempty"`
		ValidUntil string `json:"validUntilStr,omitempty"`
	}

	result := make([]TicketView, 0)
	for rows.Next() {
		var t TicketView
		var validFrom, validUntil sql.NullTime
		var assignedCred sql.NullString
		var requestedStart, requestedEnd sql.NullTime
		var accessType, urgency sql.NullString
		if err := rows.Scan(
			&t.ID, &t.RequesterID, &t.ApproverID, &t.ServerID,
			&t.Reason, &t.Status, &validFrom, &validUntil, &assignedCred, &t.IsDeleted,
			&t.CreatedDate, &t.UpdatedDate, &t.Hostname,
			&requestedStart, &requestedEnd, &accessType, &urgency,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if validFrom.Valid {
			t.ValidFrom = validFrom.Time.Format(time.RFC3339)
		}
		if validUntil.Valid {
			t.ValidUntil = validUntil.Time.Format(time.RFC3339)
		}
		if assignedCred.Valid {
			t.AssignedCredentialID = assignedCred.String
		}
		if requestedStart.Valid {
			t.RequestedStartTime = requestedStart.Time
		}
		if requestedEnd.Valid {
			t.RequestedEndTime = requestedEnd.Time
		}
		if accessType.Valid {
			t.AccessType = accessType.String
		}
		if urgency.Valid {
			t.Urgency = urgency.String
		}
		result = append(result, t)
	}

	json.NewEncoder(w).Encode(result)
}

func (c *TicketController) GrantAccess(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload struct {
		RequesterID          string  `json:"requesterId"`
		ServerID             string  `json:"serverId"`
		AssignedCredentialID string  `json:"assignedCredentialId"`
		Duration             float64 `json:"durationHours"`
		Reason               string  `json:"reason"`
		ApproverID           string  `json:"approverId"`
		ValidUntil           string  `json:"validUntil"`
		ValidFrom            string  `json:"validFrom"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	if payload.RequesterID == "" || payload.ServerID == "" || payload.AssignedCredentialID == "" || payload.ApproverID == "" {
		http.Error(w, "requesterId, serverId, assignedCredentialId, and approverId are required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	validFrom := parseValidUntil(payload.ValidFrom, 0, now)
	validUntil := parseValidUntil(payload.ValidUntil, payload.Duration, validFrom)

	row := c.db.QueryRow(`SELECT CONVERT(VARCHAR(36), NEWID())`)
	var ticketID string
	if err := row.Scan(&ticketID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	reason := payload.Reason
	if reason == "" {
		reason = "Direct Admin Access Grant"
	}

	_, err := c.db.Exec(`
		INSERT INTO dbo.Ticket (
			id, requesterid, serverid, reason, status, isdeleted, createddate, updateddate, validfrom, validuntil, assignedcredentialid, approverid, accesstype, urgency
		) VALUES (
			@p1, @p2, @p3, @p4, 'Approved', 0, @p5, @p5, @p6, @p7, @p8, @p9, 'Remote Access', 'Normal'
		)
	`, ticketID, payload.RequesterID, payload.ServerID, reason, now, validFrom, validUntil, payload.AssignedCredentialID, payload.ApproverID)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	auditLogger.LogEvent(
		payload.ApproverID,
		"Admin",
		"Grant Direct Access",
		"Ticket",
		ticketID,
		"",
		r.RemoteAddr,
		"Success",
		"Info",
		"Direct access granted to "+payload.RequesterID+" until "+validUntil.Format(time.RFC3339),
	)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         ticketID,
		"status":     "Approved",
		"validUntil": validUntil,
	})
}

func nullIfTimeZero(t time.Time) sql.NullTime {
	if t.IsZero() {
		return sql.NullTime{Valid: false}
	}
	return sql.NullTime{Time: t, Valid: true}
}

func parseValidUntil(validUntilStr string, durationHours float64, fallbackTime time.Time) time.Time {
	if validUntilStr != "" {
		if t, err := time.Parse(time.RFC3339, validUntilStr); err == nil {
			return t.UTC()
		}
		if t, err := time.Parse("2006-01-02T15:04:05Z07:00", validUntilStr); err == nil {
			return t.UTC()
		}
		if t, err := time.Parse("2006-01-02T15:04:05", validUntilStr); err == nil {
			return t.UTC()
		}
		if t, err := time.Parse("2006-01-02T15:04", validUntilStr); err == nil {
			return t.UTC()
		}
	}
	if durationHours <= 0 {
		durationHours = 1.0
	}
	return fallbackTime.Add(time.Duration(durationHours * float64(time.Hour)))
}

func (c *TicketController) ModifyAccess(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload struct {
		ValidUntil           string `json:"validUntil"`
		ApproverID           string `json:"approverId"`
		AssignedCredentialID string `json:"assignedCredentialId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	if payload.ApproverID == "" {
		http.Error(w, "approverId is required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	var validUntil time.Time
	if payload.ValidUntil != "" {
		validUntil = parseValidUntil(payload.ValidUntil, 0, now)
	} else {
		http.Error(w, "validUntil is required", http.StatusBadRequest)
		return
	}

	_, err := c.db.Exec(`
		UPDATE dbo.Ticket
		SET validuntil = @p2, 
		    approverid = @p3, 
		    updateddate = @p4,
		    assignedcredentialid = CASE WHEN @p5 IS NOT NULL THEN @p5 ELSE assignedcredentialid END
		WHERE id = @p1 AND status = 'Approved' AND isdeleted = 0
	`, id, validUntil, payload.ApproverID, now, nullIfEmpty(payload.AssignedCredentialID))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Also expire any active session audits associated with this ticket if the new time is in the past
	if now.After(validUntil) {
		_, _ = c.db.Exec(`
			UPDATE dbo.SessionAudit
			SET EndTime = @p2
			WHERE TicketID = @p1 AND EndTime IS NULL
		`, id, validUntil)
	}

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	auditLogger.LogEvent(
		payload.ApproverID,
		"Admin",
		"Modify Ticket Access",
		"Ticket",
		id,
		"",
		r.RemoteAddr,
		"Success",
		"Info",
		"Ticket access modified. Valid until: "+validUntil.Format(time.RFC3339),
	)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":    "Ticket access modified successfully",
		"validUntil": validUntil,
	})
}

func (c *TicketController) GetTicketByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var status string
	var validFrom, validUntil sql.NullTime
	err := c.db.QueryRow(`
		SELECT status, validfrom, validuntil
		FROM dbo.Ticket
		WHERE id = @p1 AND isdeleted = 0
	`, id).Scan(&status, &validFrom, &validUntil)

	if err == sql.ErrNoRows {
		http.Error(w, "ticket not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var validFromStr, validUntilStr string
	if validFrom.Valid {
		validFromStr = validFrom.Time.Format(time.RFC3339)
	}
	if validUntil.Valid {
		validUntilStr = validUntil.Time.Format(time.RFC3339)
	}

	response := map[string]interface{}{
		"id":         id,
		"status":     status,
		"validFrom":  validFromStr,
		"validUntil": validUntilStr,
	}
	json.NewEncoder(w).Encode(response)
}


