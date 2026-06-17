package controller

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"xentral-acms-api/internal/model"
)

type AuditLogController struct {
	db *sql.DB
}

func NewAuditLogController(db *sql.DB) *AuditLogController {
	return &AuditLogController{
		db: db,
	}
}

// LogEvent is an internal helper to log events directly from other controllers
func (c *AuditLogController) LogEvent(actor, actorRole, actionType, targetType, targetName, serverName, sourceIP, result, severity, details string) error {
	_, err := c.db.Exec(`
		INSERT INTO dbo.AuditLog (
			Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, ServerName, SourceIP, Result, Severity, Details
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11
		)
	`,
		time.Now().UTC(), actor, actorRole, actionType, targetType, targetName, serverName, sourceIP, result, severity, details,
	)
	return err
}

func (c *AuditLogController) GetAuditLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	serverName := r.URL.Query().Get("serverName")

	var rows *sql.Rows
	var err error

	if serverName != "" {
		rows, err = c.db.Query(`
			SELECT LogID, Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, ServerName, SourceIP, Result, Severity, Details
			FROM dbo.AuditLog
			WHERE ServerName = @p1
			ORDER BY Timestamp DESC
		`, serverName)
	} else {
		rows, err = c.db.Query(`
			SELECT LogID, Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, ServerName, SourceIP, Result, Severity, Details
			FROM dbo.AuditLog
			ORDER BY Timestamp DESC
		`)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs []model.AuditLog
	for rows.Next() {
		var log model.AuditLog
		var targetName, serverName, sourceIP, details sql.NullString
		if err := rows.Scan(
			&log.LogID, &log.Timestamp, &log.Actor, &log.ActorRole, &log.ActionType,
			&log.TargetType, &targetName, &serverName, &sourceIP, &log.Result,
			&log.Severity, &details,
		); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if targetName.Valid {
			log.TargetName = targetName.String
		}
		if serverName.Valid {
			log.ServerName = serverName.String
		}
		if sourceIP.Valid {
			log.SourceIP = sourceIP.String
		}
		if details.Valid {
			log.Details = details.String
		}
		logs = append(logs, log)
	}

	json.NewEncoder(w).Encode(logs)
}

// ClearLogs truncates the AuditLog table. Super Admin only — enforced by frontend role gating.
// It first inserts one final log entry recording who performed the clear.
func (c *AuditLogController) ClearLogs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Read who is clearing (passed as query param from frontend)
	actor := r.URL.Query().Get("actor")
	if actor == "" {
		actor = "SuperAdmin"
	}

	// Record the clear action itself before wiping
	_, _ = c.db.Exec(`
		INSERT INTO dbo.AuditLog (
			Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, SourceIP, Result, Severity, Details
		) VALUES (
			@p1, @p2, 'SUPER_ADMIN', 'Clear Audit Logs', 'AuditLog', 'All Logs', @p3, 'Success', 'Critical',
			'All audit log records were cleared by Super Admin'
		)
	`, time.Now().UTC(), actor, r.RemoteAddr)

	// Delete all OTHER logs (the one we just inserted stays)
	_, err := c.db.Exec(`
		DELETE FROM dbo.AuditLog
		WHERE Details != 'All audit log records were cleared by Super Admin'
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Audit logs cleared successfully"})
}

