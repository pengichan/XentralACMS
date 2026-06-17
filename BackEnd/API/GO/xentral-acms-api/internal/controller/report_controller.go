package controller

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"xentral-acms-api/internal/model"
)

type ReportController struct {
	db *sql.DB
}

func NewReportController(db *sql.DB) *ReportController {
	return &ReportController{
		db: db,
	}
}

func (c *ReportController) ExportReport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload struct {
		ExportType   string `json:"exportType"`
		ExportFormat string `json:"exportFormat"`
		ExportedBy   string `json:"exportedBy"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	if payload.ExportType == "" || payload.ExportFormat == "" || payload.ExportedBy == "" {
		http.Error(w, "exportType, exportFormat, and exportedBy are required", http.StatusBadRequest)
		return
	}

	var csvContent string
	var err error

	switch payload.ExportType {
	case "Server Inventory":
		csvContent, err = c.generateServerInventoryCSV()
	case "User List":
		csvContent, err = c.generateUserListCSV()
	case "Ticket History":
		csvContent, err = c.generateTicketHistoryCSV()
	case "Access History":
		csvContent, err = c.generateAccessHistoryCSV()
	case "Audit Log":
		csvContent, err = c.generateAuditLogCSV()
	case "Credential Inventory":
		csvContent, err = c.generateCredentialInventoryCSV()
	default:
		http.Error(w, "unsupported report type: "+payload.ExportType, http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, "failed to generate CSV report: "+err.Error(), http.StatusInternalServerError)
		return
	}

	history := model.ReportsExportHistory{
		ExportedBy:   payload.ExportedBy,
		ExportType:   payload.ExportType,
		ExportFormat: payload.ExportFormat,
		ExportTime:   time.Now().UTC(),
		Status:       "Completed",
		Details:      fmt.Sprintf("Report exported successfully with %d characters", len(csvContent)),
	}

	row := c.db.QueryRow(`SELECT CONVERT(VARCHAR(36), NEWID())`)
	if err := row.Scan(&history.ExportID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = c.db.Exec(`
		INSERT INTO dbo.ReportsExportHistory (
			ExportID, ExportedBy, ExportType, ExportFormat, ExportTime, Status, Details
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7
		)
	`,
		history.ExportID, history.ExportedBy, history.ExportType, history.ExportFormat, history.ExportTime, history.Status, history.Details,
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Write to global audit log as well
	_, _ = c.db.Exec(`
		INSERT INTO dbo.AuditLog (
			Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, SourceIP, Result, Severity, Details
		) VALUES (
			@p1, @p2, 'ADMIN', 'Report Exported', 'Report', @p3, @p4, 'Success', 'Info', @p5
		)
	`,
		time.Now().UTC(),
		payload.ExportedBy,
		payload.ExportType,
		r.RemoteAddr,
		fmt.Sprintf("User %s exported %s report in %s format", payload.ExportedBy, payload.ExportType, payload.ExportFormat),
	)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":  "Report exported successfully",
		"csvData":  csvContent,
		"filename": fmt.Sprintf("%s_%d.csv", strings.ReplaceAll(strings.ToLower(payload.ExportType), " ", "_"), time.Now().Unix()),
		"data":     history,
	})
}

func (c *ReportController) generateServerInventoryCSV() (string, error) {
	rows, err := c.db.Query(`
		SELECT CONVERT(VARCHAR(36), id) AS id, hostname, ipaddress, ostype, ISNULL(description,''), isactive, createddate
		FROM dbo.Server
		WHERE isdeleted = 0
		ORDER BY createddate DESC
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var sb strings.Builder
	writer := csv.NewWriter(&sb)
	writer.Write([]string{"Server ID", "Hostname", "IP Address", "OS Type", "Description", "Active Status", "Created Date"})

	for rows.Next() {
		var id, hostname, ip, os, desc, created string
		var active bool
		if err := rows.Scan(&id, &hostname, &ip, &os, &desc, &active, &created); err != nil {
			return "", err
		}
		status := "Active"
		if !active {
			status = "Inactive"
		}
		writer.Write([]string{id, hostname, ip, os, desc, status, created})
	}
	writer.Flush()
	return sb.String(), writer.Error()
}

func (c *ReportController) generateUserListCSV() (string, error) {
	rows, err := c.db.Query(`
		SELECT CONVERT(VARCHAR(36), u.id), u.user_id, u.first_name, u.last_name, u.email, ur.role_name, u.is_active, u.created_date
		FROM dbo.users u
		JOIN dbo.user_role ur ON ur.id = u.user_role_id
		WHERE u.is_deleted = 0
		ORDER BY u.created_date DESC
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var sb strings.Builder
	writer := csv.NewWriter(&sb)
	writer.Write([]string{"User UUID", "User ID / Username", "First Name", "Last Name", "Email", "Role", "Active Status", "Created Date"})

	for rows.Next() {
		var id, userID, firstName, lastName, email, role, created string
		var active bool
		if err := rows.Scan(&id, &userID, &firstName, &lastName, &email, &role, &active, &created); err != nil {
			return "", err
		}
		status := "Active"
		if !active {
			status = "Disabled"
		}
		writer.Write([]string{id, userID, firstName, lastName, email, role, status, created})
	}
	writer.Flush()
	return sb.String(), writer.Error()
}

func (c *ReportController) generateTicketHistoryCSV() (string, error) {
	rows, err := c.db.Query(`
		SELECT CONVERT(VARCHAR(36), t.id), t.requesterid, s.hostname, t.reason, t.status, ISNULL(CONVERT(VARCHAR(30), t.validuntil, 127), 'N/A'), t.createddate
		FROM dbo.Ticket t
		JOIN dbo.Server s ON s.id = t.serverid
		WHERE t.isdeleted = 0
		ORDER BY t.createddate DESC
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var sb strings.Builder
	writer := csv.NewWriter(&sb)
	writer.Write([]string{"Ticket ID", "Requester ID", "Server Hostname", "Reason", "Status", "Valid Until", "Requested Date"})

	for rows.Next() {
		var id, req, server, reason, status, valid, created string
		if err := rows.Scan(&id, &req, &server, &reason, &status, &valid, &created); err != nil {
			return "", err
		}
		writer.Write([]string{id, req, server, reason, status, valid, created})
	}
	writer.Flush()
	return sb.String(), writer.Error()
}

func (c *ReportController) generateAccessHistoryCSV() (string, error) {
	rows, err := c.db.Query(`
		SELECT CONVERT(VARCHAR(36), sa.id), sa.userid, s.hostname, sa.protocol, ISNULL(sa.clientip,'Unknown'), sa.starttime, ISNULL(CONVERT(VARCHAR(30), sa.endtime, 127), 'Active')
		FROM dbo.SessionAudit sa
		JOIN dbo.Server s ON s.id = sa.serverid
		ORDER BY sa.starttime DESC
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var sb strings.Builder
	writer := csv.NewWriter(&sb)
	writer.Write([]string{"Session ID", "User ID", "Server Hostname", "Protocol", "Client IP", "Start Time", "End Time"})

	for rows.Next() {
		var id, user, server, protocol, client, start, end string
		if err := rows.Scan(&id, &user, &server, &protocol, &client, &start, &end); err != nil {
			return "", err
		}
		writer.Write([]string{id, user, server, protocol, client, start, end})
	}
	writer.Flush()
	return sb.String(), writer.Error()
}

func (c *ReportController) generateAuditLogCSV() (string, error) {
	rows, err := c.db.Query(`
		SELECT LogID, Timestamp, Actor, ActorRole, ActionType, TargetType, ISNULL(TargetName,''), ISNULL(ServerName,''), ISNULL(SourceIP,''), Result, Severity, ISNULL(Details,'')
		FROM dbo.AuditLog
		ORDER BY Timestamp DESC
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var sb strings.Builder
	writer := csv.NewWriter(&sb)
	writer.Write([]string{"Log ID", "Timestamp", "Actor", "Actor Role", "Action Type", "Target Type", "Target Name", "Server Name", "Source IP", "Result", "Severity", "Details"})

	for rows.Next() {
		var id string
		var timestamp, actor, role, action, targetType, targetName, server, source, result, severity, details string
		if err := rows.Scan(&id, &timestamp, &actor, &role, &action, &targetType, &targetName, &server, &source, &result, &severity, &details); err != nil {
			return "", err
		}
		writer.Write([]string{id, timestamp, actor, role, action, targetType, targetName, server, source, result, severity, details})
	}
	writer.Flush()
	return sb.String(), writer.Error()
}

func (c *ReportController) generateCredentialInventoryCSV() (string, error) {
	rows, err := c.db.Query(`
		SELECT CONVERT(VARCHAR(36), c.id), s.hostname, c.username, c.secrettype, c.isactive, c.createddate
		FROM dbo.Credential c
		JOIN dbo.Server s ON s.id = c.serverid
		WHERE c.isdeleted = 0
		ORDER BY c.createddate DESC
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var sb strings.Builder
	writer := csv.NewWriter(&sb)
	writer.Write([]string{"Credential ID", "Server Hostname", "Username", "Secret Type", "Active Status", "Created Date"})

	for rows.Next() {
		var id, server, username, secretType, created string
		var active bool
		if err := rows.Scan(&id, &server, &username, &secretType, &active, &created); err != nil {
			return "", err
		}
		status := "Active"
		if !active {
			status = "Inactive"
		}
		writer.Write([]string{id, server, username, secretType, status, created})
	}
	writer.Flush()
	return sb.String(), writer.Error()
}

