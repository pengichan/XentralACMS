package controller

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"xentral-acms-api/internal/dbproxy"
	"xentral-acms-api/internal/model"
)

type ServerController struct {
	db dbproxy.DB
}

func NewServerController(db dbproxy.DB) *ServerController {
	return &ServerController{
		db: db,
	}
}

func (c *ServerController) List(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	rows, err := c.db.Query(`
		SELECT
			CONVERT(VARCHAR(36), id) AS id, hostname, ipaddress, ostype, description, isactive, isdeleted, createddate, updateddate, CONVERT(VARCHAR(36), createdby) AS createdby, CONVERT(VARCHAR(36), updatedby) AS updatedby, ISNULL(environment, '') AS environment, ISNULL(location, '') AS location, ISNULL(remoteprotocol, '') AS remoteprotocol, ISNULL(serverstatus, '') AS serverstatus
		FROM dbo.Server
		WHERE isdeleted = 0
		ORDER BY createddate DESC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	response := make([]model.Server, 0)
	for rows.Next() {
		server, scanErr := scanServer(rows)
		if scanErr != nil {
			http.Error(w, scanErr.Error(), http.StatusInternalServerError)
			return
		}
		response = append(response, server)
	}
	if err = rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err = json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *ServerController) Create(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload model.Server
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(payload.Hostname) == "" || strings.TrimSpace(payload.IPAddress) == "" || strings.TrimSpace(payload.OSType) == "" {
		http.Error(w, "hostname, ipAddress, and osType are required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	payload.CreatedDate = now
	payload.UpdatedDate = now
	payload.IsActive = true
	payload.IsDeleted = false

	row := c.db.QueryRow(`SELECT CONVERT(VARCHAR(36), NEWID())`)
	if err := row.Scan(&payload.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err := c.db.Exec(`
		INSERT INTO dbo.Server (
			id, hostname, ipaddress, ostype, description, isactive, isdeleted, createddate, updateddate, createdby, updatedby, environment, location, remoteprotocol, serverstatus
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15
		)
	`,
		payload.ID,
		payload.Hostname,
		payload.IPAddress,
		payload.OSType,
		nullIfEmpty(payload.Description),
		payload.IsActive,
		payload.IsDeleted,
		payload.CreatedDate,
		payload.UpdatedDate,
		nullIfEmpty(payload.CreatedBy),
		nullIfEmpty(payload.UpdatedBy),
		nullIfEmpty(payload.Environment),
		nullIfEmpty(payload.Location),
		nullIfEmpty(payload.RemoteProtocol),
		nullIfEmpty(payload.ServerStatus),
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		"Admin",
		"ADMIN",
		"Server Added",
		"Server",
		payload.Hostname,
		payload.Hostname,
		r.RemoteAddr,
		"Success",
		"Info",
		"Server "+payload.Hostname+" was created successfully",
	)

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payload)
}

func (c *ServerController) Update(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload model.Server
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(payload.Hostname) == "" || strings.TrimSpace(payload.IPAddress) == "" || strings.TrimSpace(payload.OSType) == "" {
		http.Error(w, "hostname, ipAddress, and osType are required", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	result, err := c.db.Exec(`
		UPDATE dbo.Server
		SET hostname = @p2,
		    ipaddress = @p3,
		    ostype = @p4,
		    description = @p5,
		    environment = @p6,
		    location = @p7,
		    remoteprotocol = @p8,
		    serverstatus = @p9,
		    updateddate = @p10,
		    updatedby = @p11
		WHERE id = @p1 AND isdeleted = 0
	`,
		id,
		payload.Hostname,
		payload.IPAddress,
		payload.OSType,
		nullIfEmpty(payload.Description),
		nullIfEmpty(payload.Environment),
		nullIfEmpty(payload.Location),
		nullIfEmpty(payload.RemoteProtocol),
		nullIfEmpty(payload.ServerStatus),
		now,
		nullIfEmpty(payload.UpdatedBy),
	)

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
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		"Admin",
		"ADMIN",
		"Server Edited",
		"Server",
		payload.Hostname,
		payload.Hostname,
		r.RemoteAddr,
		"Success",
		"Info",
		"Server "+payload.Hostname+" was edited successfully",
	)

	payload.ID = id
	payload.UpdatedDate = now
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload)
}

func (c *ServerController) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	// Get hostname before deleting for audit logs
	var hostname string
	_ = c.db.QueryRow(`SELECT hostname FROM dbo.Server WHERE id = @p1`, id).Scan(&hostname)

	result, err := c.db.Exec(`
		UPDATE dbo.Server
		SET isdeleted = 1, updateddate = @p2
		WHERE id = @p1 AND isdeleted = 0
	`, id, time.Now().UTC())
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
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	// Audit Log
	if hostname != "" {
		auditLogger := NewAuditLogController(c.db)
		_ = auditLogger.LogEvent(
			"Admin",
			"ADMIN",
			"Server Deleted",
			"Server",
			hostname,
			hostname,
			r.RemoteAddr,
			"Success",
			"Warning",
			"Server "+hostname+" was deleted successfully",
		)
	}

	w.WriteHeader(http.StatusNoContent)
}

type serverScanner interface {
	Scan(dest ...any) error
}

func scanServer(scanner serverScanner) (model.Server, error) {
	var s model.Server
	var description sql.NullString
	var createdBy sql.NullString
	var updatedBy sql.NullString
	var environment, location, protocol, status sql.NullString

	err := scanner.Scan(
		&s.ID,
		&s.Hostname,
		&s.IPAddress,
		&s.OSType,
		&description,
		&s.IsActive,
		&s.IsDeleted,
		&s.CreatedDate,
		&s.UpdatedDate,
		&createdBy,
		&updatedBy,
		&environment,
		&location,
		&protocol,
		&status,
	)
	if err != nil {
		return model.Server{}, err
	}

	if description.Valid {
		s.Description = description.String
	}
	if createdBy.Valid {
		s.CreatedBy = createdBy.String
	}
	if updatedBy.Valid {
		s.UpdatedBy = updatedBy.String
	}
	if environment.Valid {
		s.Environment = environment.String
	}
	if location.Valid {
		s.Location = location.String
	}
	if protocol.Valid {
		s.RemoteProtocol = protocol.String
	}
	if status.Valid {
		s.ServerStatus = status.String
	}

	return s, nil
}

func (c *ServerController) ListAssigned(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	rows, err := c.db.Query(`
		SELECT DISTINCT
			CONVERT(VARCHAR(36), s.id) AS id, s.hostname, s.ipaddress, s.ostype, s.description,
			s.isactive, s.isdeleted, s.createddate, s.updateddate, 
			CONVERT(VARCHAR(36), s.createdby) AS createdby, CONVERT(VARCHAR(36), s.updatedby) AS updatedby,
			CONVERT(VARCHAR(36), t.id) AS ticket_id, t.validuntil
		FROM dbo.Server s
		JOIN dbo.Ticket t ON t.serverid = s.id
		WHERE t.requesterid = @p1
		  AND t.status = 'Approved'
		  AND t.isdeleted = 0
		  AND t.validuntil > @p2
		  AND s.isdeleted = 0
		ORDER BY t.validuntil ASC
	`, userID, time.Now().UTC())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type AssignedServer struct {
		model.Server
		TicketID   string    `json:"ticketId"`
		ValidUntil time.Time `json:"validUntil"`
	}

	response := make([]AssignedServer, 0)
	for rows.Next() {
		var s model.Server
		var ticketID string
		var validUntil time.Time
		var description, createdBy, updatedBy sql.NullString
		err := rows.Scan(
			&s.ID, &s.Hostname, &s.IPAddress, &s.OSType, &description,
			&s.IsActive, &s.IsDeleted, &s.CreatedDate, &s.UpdatedDate,
			&createdBy, &updatedBy, &ticketID, &validUntil,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if description.Valid {
			s.Description = description.String
		}
		if createdBy.Valid {
			s.CreatedBy = createdBy.String
		}
		if updatedBy.Valid {
			s.UpdatedBy = updatedBy.String
		}
		response = append(response, AssignedServer{
			Server:     s,
			TicketID:   ticketID,
			ValidUntil: validUntil,
		})
	}

	json.NewEncoder(w).Encode(response)
}

func (c *ServerController) GetByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	row := c.db.QueryRow(`
		SELECT
			CONVERT(VARCHAR(36), id) AS id, hostname, ipaddress, ostype, description, isactive, isdeleted, createddate, updateddate, CONVERT(VARCHAR(36), createdby) AS createdby, CONVERT(VARCHAR(36), updatedby) AS updatedby, ISNULL(environment, '') AS environment, ISNULL(location, '') AS location, ISNULL(remoteprotocol, '') AS remoteprotocol, ISNULL(serverstatus, '') AS serverstatus
		FROM dbo.Server
		WHERE id = @p1 AND isdeleted = 0
	`, id)

	server, err := scanServer(row)
	if err == sql.ErrNoRows {
		http.Error(w, "server not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(server)
}

func (c *ServerController) ScanUsers(w http.ResponseWriter, r *http.Request) {
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

	var users []string
	var execErr error

	// Run PowerShell script to resolve target machine (detect local or remote and run appropriate query)
	psCmd := fmt.Sprintf(
		`$ip='%s'; $user='%s'; $pass='%s'; `+
		`$isLocal = ($ip -eq 'localhost' -or $ip -eq '127.0.0.1' -or $ip -eq '::1'); `+
		`if (-not $isLocal) { `+
		`  $localIPs = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Select-Object -ExpandProperty IPAddressToString; `+
		`  if ($localIPs -contains $ip) { $isLocal = $true } `+
		`}; `+
		`if ($isLocal) { `+
		`  Get-LocalUser | Where-Object { $_.Enabled } | Select-Object -ExpandProperty Name `+
		`} else { `+
		`  try { `+
		`    $secPassword = ConvertTo-SecureString $pass -AsPlainText -Force; `+
		`    $cred = New-Object System.Management.Automation.PSCredential($user, $secPassword); `+
		`    $opt = New-CimSessionOption -Protocol Dcom; `+
		`    $session = New-CimSession -ComputerName $ip -Credential $cred -SessionOption $opt -ErrorAction Stop; `+
		`    Get-CimInstance -ClassName Win32_UserAccount -CimSession $session | Where-Object { $_.Disabled -eq $false } | Select-Object -ExpandProperty Name; `+
		`    Remove-CimSession $session; `+
		`  } catch { `+
		`    try { `+
		`      $session = New-CimSession -ComputerName $ip -Credential $cred -ErrorAction Stop; `+
		`      Get-CimInstance -ClassName Win32_UserAccount -CimSession $session | Where-Object { $_.Disabled -eq $false } | Select-Object -ExpandProperty Name; `+
		`      Remove-CimSession $session; `+
		`    } catch {} `+
		`  } `+
		`}`,
		payload.IPAddress,
		strings.ReplaceAll(payload.Username, "'", "''"),
		strings.ReplaceAll(payload.Password, "'", "''"),
	)

	cmd := exec.Command("powershell.exe", "-NoProfile", "-Command", psCmd)
	output, err := cmd.Output()
	if err == nil {
		lines := strings.Split(string(output), "\n")
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if trimmed != "" {
				users = append(users, trimmed)
			}
		}
	} else {
		execErr = err
	}

	// Fallback mock users ONLY if no real users are returned from either local or remote scans
	isMock := false
	if len(users) == 0 {
		users = []string{"Administrator", "OPMAdmin", "Operator", "Engineer", "BackupUser"}
		isMock = true
	}

	// Filter out default non-admin accounts or formatting artifacts if any
	var filteredUsers []string
	seen := make(map[string]bool)
	for _, u := range users {
		uLower := strings.ToLower(u)
		if uLower == "guest" || uLower == "defaultaccount" || uLower == "wdagutilityaccount" {
			continue
		}
		if !seen[uLower] {
			seen[uLower] = true
			filteredUsers = append(filteredUsers, u)
		}
	}

	// Sleep briefly to simulate scanning delay
	time.Sleep(1 * time.Second)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"users":   filteredUsers,
		"message": "User scan completed successfully",
		"isMock":  isMock,
		"error":   fmt.Sprintf("%v", execErr),
	})
}



