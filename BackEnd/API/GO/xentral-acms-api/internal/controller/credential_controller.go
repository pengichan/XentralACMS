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
	"xentral-acms-api/internal/utils"
)

// In a real production app, this should be read from an environment variable.
const masterKey = "12345678901234567890123456789012"

type CredentialController struct {
	db dbproxy.DB
}

func NewCredentialController(db dbproxy.DB) *CredentialController {
	return &CredentialController{
		db: db,
	}
}

func (c *CredentialController) ListByServer(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	serverID := r.PathValue("serverId")

	rows, err := c.db.Query(`
		SELECT
			CONVERT(VARCHAR(36), id) AS id, CONVERT(VARCHAR(36), serverid) AS serverid, username, secrettype, ISNULL(accounttype, 'Local') AS accounttype, isactive, isdeleted, createddate, updateddate, CONVERT(VARCHAR(36), createdby) AS createdby, CONVERT(VARCHAR(36), updatedby) AS updatedby
		FROM dbo.Credential
		WHERE isdeleted = 0 AND serverid = @p1
		ORDER BY createddate DESC
	`, serverID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	response := make([]model.Credential, 0)
	for rows.Next() {
		var cred model.Credential
		var createdBy, updatedBy sql.NullString
		err := rows.Scan(
			&cred.ID,
			&cred.ServerID,
			&cred.Username,
			&cred.SecretType,
			&cred.AccountType,
			&cred.IsActive,
			&cred.IsDeleted,
			&cred.CreatedDate,
			&cred.UpdatedDate,
			&createdBy,
			&updatedBy,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if createdBy.Valid {
			cred.CreatedBy = createdBy.String
		}
		if updatedBy.Valid {
			cred.UpdatedBy = updatedBy.String
		}
		response = append(response, cred)
	}

	if err = json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *CredentialController) Create(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload model.Credential
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(payload.ServerID) == "" || strings.TrimSpace(payload.Username) == "" || strings.TrimSpace(payload.EncryptedPassword) == "" {
		http.Error(w, "serverId, username, and password are required", http.StatusBadRequest)
		return
	}

	plainPassword := payload.EncryptedPassword
	// Encrypt the password before storing
	encrypted, err := utils.Encrypt(payload.EncryptedPassword, masterKey)
	if err != nil {
		http.Error(w, "failed to encrypt credential", http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC()
	payload.EncryptedPassword = encrypted
	payload.CreatedDate = now
	payload.UpdatedDate = now
	payload.IsActive = true
	payload.IsDeleted = false
	if payload.SecretType == "" {
		payload.SecretType = "Password"
	}
	if payload.AccountType == "" {
		payload.AccountType = "Local"
	}


	row := c.db.QueryRow(`SELECT CONVERT(VARCHAR(36), NEWID())`)
	if err := row.Scan(&payload.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, err = c.db.Exec(`
		INSERT INTO dbo.Credential (
			id, serverid, username, encryptedpassword, secrettype, accounttype, isactive, isdeleted, createddate, updateddate, createdby, updatedby
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12
		)
	`,
		payload.ID,
		payload.ServerID,
		payload.Username,
		payload.EncryptedPassword,
		payload.SecretType,
		payload.AccountType,
		payload.IsActive,
		payload.IsDeleted,
		payload.CreatedDate,
		payload.UpdatedDate,
		nullIfEmpty(payload.CreatedBy),
		nullIfEmpty(payload.UpdatedBy),
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Fetch hostname for audit log
	var hostname string
	_ = c.db.QueryRow(`SELECT hostname FROM dbo.Server WHERE id = @p1`, payload.ServerID).Scan(&hostname)

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		"Admin",
		"ADMIN",
		"Credential Added",
		"Credential",
		payload.Username,
		hostname,
		r.RemoteAddr,
		"Success",
		"Info",
		"Credential for "+payload.Username+" was added successfully",
	)

	// Sync the user to the target host and make them a member of Remote Desktop Users
	var ipAddress string
	_ = c.db.QueryRow(`SELECT ipaddress FROM dbo.Server WHERE id = @p1`, payload.ServerID).Scan(&ipAddress)

	if ipAddress != "" && strings.EqualFold(payload.SecretType, "Password") && strings.EqualFold(payload.AccountType, "Local") {
		syncErr := c.syncUserToTargetServer(payload.ServerID, payload.Username, plainPassword, ipAddress)
		if syncErr != nil {
			_ = auditLogger.LogEvent(
				"Admin",
				"ADMIN",
				"Credential Sync Failure",
				"Credential",
				payload.Username,
				hostname,
				r.RemoteAddr,
				"Failure",
				"Warning",
				fmt.Sprintf("Failed to provision user '%s' on server '%s' (%s): %v", payload.Username, hostname, ipAddress, syncErr),
			)
		} else {
			_ = auditLogger.LogEvent(
				"Admin",
				"ADMIN",
				"Credential Sync Success",
				"Credential",
				payload.Username,
				hostname,
				r.RemoteAddr,
				"Success",
				"Info",
				fmt.Sprintf("Successfully provisioned user '%s' on server '%s' (%s) and added them to Remote Desktop Users group", payload.Username, hostname, ipAddress),
			)
		}
	}

	// Hide the encrypted password from the response
	payload.EncryptedPassword = ""

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payload)
}

func (c *CredentialController) Update(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload model.Credential
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(payload.Username) == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}

	if payload.AccountType == "" {
		payload.AccountType = "Local"
	}


	// Fetch existing credential details and server connection parameters
	var serverID, ipAddress, existingPassword string
	err := c.db.QueryRow(`
		SELECT CONVERT(VARCHAR(36), c.serverid), s.ipaddress, c.encryptedpassword 
		FROM dbo.Credential c
		JOIN dbo.Server s ON s.id = c.serverid
		WHERE c.id = @p1 AND c.isdeleted = 0
	`, id).Scan(&serverID, &ipAddress, &existingPassword)

	if err == sql.ErrNoRows {
		http.Error(w, "credential not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Encrypt the new password if provided, otherwise preserve existing password
	plainPassword := payload.EncryptedPassword
	var encryptedPassword string
	var passwordChanged bool
	if strings.TrimSpace(payload.EncryptedPassword) != "" {
		encrypted, err := utils.Encrypt(payload.EncryptedPassword, masterKey)
		if err != nil {
			http.Error(w, "failed to encrypt credential", http.StatusInternalServerError)
			return
		}
		encryptedPassword = encrypted
		passwordChanged = true
	} else {
		encryptedPassword = existingPassword
	}

	now := time.Now().UTC()
	result, err := c.db.Exec(`
		UPDATE dbo.Credential
		SET username = @p2,
		    encryptedpassword = @p3,
		    secrettype = @p4,
		    accounttype = @p5,
		    updateddate = @p6,
		    updatedby = @p7
		WHERE id = @p1 AND isdeleted = 0
	`,
		id,
		payload.Username,
		encryptedPassword,
		payload.SecretType,
		payload.AccountType,
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
		http.Error(w, "credential not found", http.StatusNotFound)
		return
	}

	// Fetch hostname for audit logs
	var hostname string
	_ = c.db.QueryRow(`
		SELECT s.hostname
		FROM dbo.Credential c
		JOIN dbo.Server s ON s.id = c.serverid
		WHERE c.id = @p1
	`, id).Scan(&hostname)

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		"Admin",
		"ADMIN",
		"Credential Edited",
		"Credential",
		payload.Username,
		hostname,
		r.RemoteAddr,
		"Success",
		"Info",
		"Credential for "+payload.Username+" was edited successfully",
	)

	// Sync the user to the target host
	if ipAddress != "" && strings.EqualFold(payload.SecretType, "Password") && strings.EqualFold(payload.AccountType, "Local") {
		var passToSync string
		if passwordChanged {
			passToSync = plainPassword
		} else {
			decrypted, err := utils.Decrypt(existingPassword, masterKey)
			if err == nil {
				passToSync = decrypted
			}
		}

		if passToSync != "" {
			syncErr := c.syncUserToTargetServer(serverID, payload.Username, passToSync, ipAddress)
			if syncErr != nil {
				_ = auditLogger.LogEvent(
					"Admin",
					"ADMIN",
					"Credential Sync Failure",
					"Credential",
					payload.Username,
					hostname,
					r.RemoteAddr,
					"Failure",
					"Warning",
					fmt.Sprintf("Failed to provision updated user '%s' on server '%s' (%s): %v", payload.Username, hostname, ipAddress, syncErr),
				)
			} else {
				_ = auditLogger.LogEvent(
					"Admin",
					"ADMIN",
					"Credential Sync Success",
					"Credential",
					payload.Username,
					hostname,
					r.RemoteAddr,
					"Success",
					"Info",
					fmt.Sprintf("Successfully provisioned updated user '%s' on server '%s' (%s) and added them to Remote Desktop Users group", payload.Username, hostname, ipAddress),
				)
			}
		}
	}

	payload.ID = id
	payload.UpdatedDate = now
	payload.EncryptedPassword = "" // Hide encrypted password
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(payload)
}

func (c *CredentialController) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	// Get username and server hostname for audit log before deleting
	var username, hostname string
	_ = c.db.QueryRow(`
		SELECT c.username, s.hostname
		FROM dbo.Credential c
		JOIN dbo.Server s ON s.id = c.serverid
		WHERE c.id = @p1
	`, id).Scan(&username, &hostname)

	result, err := c.db.Exec(`
		UPDATE dbo.Credential
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
		http.Error(w, "credential not found", http.StatusNotFound)
		return
	}

	// Audit Log
	if username != "" {
		auditLogger := NewAuditLogController(c.db)
		_ = auditLogger.LogEvent(
			"Admin",
			"ADMIN",
			"Credential Deleted",
			"Credential",
			username,
			hostname,
			r.RemoteAddr,
			"Success",
			"Warning",
			"Credential for "+username+" was deleted successfully",
		)
	}

	w.WriteHeader(http.StatusNoContent)
}

func (c *CredentialController) Reveal(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload struct {
		Actor string `json:"actor"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	// SUPER_ADMIN is required
	const superAdminRoleID = "00000000-0000-0000-0000-000000000001"
	if !strings.EqualFold(payload.Role, "SUPER_ADMIN") && !strings.EqualFold(payload.Role, superAdminRoleID) {
		http.Error(w, "only Super Admin can reveal credentials", http.StatusForbidden)
		return
	}

	var encryptedPassword, username, serverName string
	err := c.db.QueryRow(`
		SELECT c.username, c.encryptedpassword, s.hostname
		FROM dbo.Credential c
		JOIN dbo.Server s ON s.id = c.serverid
		WHERE c.id = @p1 AND c.isdeleted = 0
	`, id).Scan(&username, &encryptedPassword, &serverName)

	if err == sql.ErrNoRows {
		http.Error(w, "credential not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	decryptedPassword, err := utils.Decrypt(encryptedPassword, masterKey)
	if err != nil {
		http.Error(w, "failed to decrypt password", http.StatusInternalServerError)
		return
	}

	// Insert into dbo.AuditLog
	_, _ = c.db.Exec(`
		INSERT INTO dbo.AuditLog (
			Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, ServerName, SourceIP, Result, Severity, Details
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11
		)
	`,
		time.Now().UTC(),
		payload.Actor,
		payload.Role,
		"Credential Revealed",
		"Credential",
		username,
		serverName,
		r.RemoteAddr,
		"Success",
		"High",
		"Super Admin revealed/copied credential for "+username+" on server "+serverName,
	)

	json.NewEncoder(w).Encode(map[string]string{
		"password": decryptedPassword,
	})
}

func (c *CredentialController) syncUserToTargetServer(serverID string, username string, plainPassword string, ipAddr string) error {
	cleanUsername := username
	if strings.HasPrefix(cleanUsername, `.\`) {
		cleanUsername = strings.TrimPrefix(cleanUsername, `.\`)
	}
	if strings.HasPrefix(cleanUsername, `./`) {
		cleanUsername = strings.TrimPrefix(cleanUsername, `./`)
	}

	// 1. Check if IP is local
	isLocal := ipAddr == "localhost" || ipAddr == "127.0.0.1" || ipAddr == "::1"
	
	// Check if IP matches local adapter IP
	psCheckLocal := fmt.Sprintf(
		`$ip='%s'; `+
		`$isLocal = ($ip -eq 'localhost' -or $ip -eq '127.0.0.1' -or $ip -eq '::1'); `+
		`if (-not $isLocal) { `+
		`  $localIPs = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Select-Object -ExpandProperty IPAddressToString; `+
		`  if ($localIPs -contains $ip) { $isLocal = $true } `+
		`}; `+
		`Write-Output $isLocal`,
		ipAddr,
	)
	
	cmdCheck := exec.Command("powershell.exe", "-NoProfile", "-Command", psCheckLocal)
	outputCheck, err := cmdCheck.Output()
	if err == nil {
		if strings.TrimSpace(string(outputCheck)) == "True" {
			isLocal = true
		}
	}

	var psScript string
	if isLocal {
		psScript = fmt.Sprintf(
			`$username='%s'; $password='%s'; `+
			`$userExists = Get-LocalUser -Name $username -ErrorAction SilentlyContinue; `+
			`if (-not $userExists) { `+
			`  $secPassword = ConvertTo-SecureString $password -AsPlainText -Force; `+
			`  New-LocalUser -Name $username -Password $secPassword -Description 'Created by XentralACMS' -ErrorAction Stop; `+
			`} else { `+
			`  $secPassword = ConvertTo-SecureString $password -AsPlainText -Force; `+
			`  $userExists | Set-LocalUser -Password $secPassword; `+
			`}; `+
			`Add-LocalGroupMember -Group 'Remote Desktop Users' -Member $username -ErrorAction SilentlyContinue`,
			strings.ReplaceAll(cleanUsername, "'", "''"),
			strings.ReplaceAll(plainPassword, "'", "''"),
		)
	} else {
		// Remote machine - find admin credentials
		var adminUser, encryptedAdminPass string
		row := c.db.QueryRow(`
			SELECT TOP 1 username, encryptedpassword 
			FROM dbo.Credential 
			WHERE serverid = @p1 AND isdeleted = 0 
			ORDER BY CASE 
				WHEN LOWER(username) = 'administrator' THEN 1 
				WHEN LOWER(username) = 'opmadmin' THEN 2 
				ELSE 3 
			END ASC
		`, serverID)
		
		err := row.Scan(&adminUser, &encryptedAdminPass)
		if err != nil {
			return fmt.Errorf("no admin credentials available in vault to connect to remote server %s: %v", ipAddr, err)
		}
		
		adminPass, err := utils.Decrypt(encryptedAdminPass, masterKey)
		if err != nil {
			return fmt.Errorf("failed to decrypt admin password: %v", err)
		}

		psScript = fmt.Sprintf(
			`$ip='%s'; $adminUser='%s'; $adminPass='%s'; `+
			`try { `+
			`  $secPass = ConvertTo-SecureString $adminPass -AsPlainText -Force; `+
			`  $cred = New-Object System.Management.Automation.PSCredential($adminUser, $secPass); `+
			`  $sb = [ScriptBlock]::Create(' `+
			`    $targetUser = "%s"; `+
			`    $targetPass = "%s"; `+
			`    $userExists = Get-LocalUser -Name $targetUser -ErrorAction SilentlyContinue; `+
			`    if (-not $userExists) { `+
			`      $secPassword = ConvertTo-SecureString $targetPass -AsPlainText -Force; `+
			`      New-LocalUser -Name $targetUser -Password $secPassword -Description "Created by XentralACMS" -ErrorAction Stop; `+
			`    } else { `+
			`      $secPassword = ConvertTo-SecureString $targetPass -AsPlainText -Force; `+
			`      $userExists | Set-LocalUser -Password $secPassword; `+
			`    }; `+
			`    Add-LocalGroupMember -Group "Remote Desktop Users" -Member $targetUser -ErrorAction SilentlyContinue; `+
			`  '); `+
			`  Invoke-Command -ComputerName $ip -Credential $cred -ScriptBlock $sb -ErrorAction Stop; `+
			`} catch { `+
			`  throw $_; `+
			`}`,
			ipAddr,
			strings.ReplaceAll(adminUser, "'", "''"),
			strings.ReplaceAll(adminPass, "'", "''"),
			strings.ReplaceAll(cleanUsername, "\"", "\\\""),
			strings.ReplaceAll(plainPassword, "\"", "\\\""),
		)
	}

	cmdSync := exec.Command("powershell.exe", "-NoProfile", "-Command", psScript)
	outputSync, err := cmdSync.CombinedOutput()
	if err != nil {
		return fmt.Errorf("powershell execution error: %v, output: %s", err, string(outputSync))
	}
	return nil
}

