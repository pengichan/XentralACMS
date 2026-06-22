package controller

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"xentral-acms-api/internal/config"
	"xentral-acms-api/internal/dto"
	"xentral-acms-api/internal/mail"
)

type UserController struct {
	db     *sql.DB
	mailer *mail.Mailer
}

const defaultSignUpRoleID = "22222222-2222-2222-2222-222222222222"

func NewUserController(db *sql.DB, mailer *mail.Mailer) *UserController {
	// Auto-migrate password_reset_codes table
	_, _ = db.Exec(`
		IF OBJECT_ID('dbo.password_reset_codes', 'U') IS NULL
		BEGIN
			CREATE TABLE dbo.password_reset_codes (
				id INT IDENTITY(1,1) PRIMARY KEY,
				email VARCHAR(255) NOT NULL,
				code VARCHAR(10) NOT NULL,
				expires_at DATETIME2 NOT NULL,
				used BIT NOT NULL DEFAULT 0
			);
		END
	`)

	// Auto-migrate notifications table
	_, _ = db.Exec(`
		IF OBJECT_ID('dbo.notifications', 'U') IS NULL
		BEGIN
			CREATE TABLE dbo.notifications (
				id VARCHAR(36) PRIMARY KEY,
				user_id VARCHAR(50) NOT NULL,
				title VARCHAR(100) NOT NULL,
				message VARCHAR(255) NOT NULL,
				link VARCHAR(255) NULL,
				is_read BIT NOT NULL DEFAULT 0,
				created_at DATETIME2 NOT NULL DEFAULT GETUTCDATE()
			);
		END
	`)

	// Auto-migrate shared_files table
	_, _ = db.Exec(`
		IF OBJECT_ID('dbo.shared_files', 'U') IS NULL
		BEGIN
			CREATE TABLE dbo.shared_files (
				id VARCHAR(36) PRIMARY KEY,
				filename VARCHAR(255) NOT NULL,
				filepath VARCHAR(510) NOT NULL,
				uploaded_by VARCHAR(50) NOT NULL,
				uploaded_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
				file_size BIGINT NOT NULL
			);
		END
	`)

	return &UserController{
		db:     db,
		mailer: mailer,
	}
}

func (c *UserController) List(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	rows, err := c.db.Query(`
		SELECT
			CONVERT(VARCHAR(36), id) as id, CONVERT(VARCHAR(36), user_role_id) as user_role_id, user_id, first_name, last_name, email, mobile_no, login_password,
			remark, last_login, is_active, is_deleted, created_date, updated_date, CONVERT(VARCHAR(36), created_by) as created_by, CONVERT(VARCHAR(36), updated_by) as updated_by,
			must_change_password
		FROM dbo.users
		WHERE is_deleted = 0
		ORDER BY created_date DESC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	response := make([]dto.UserDTO, 0)
	for rows.Next() {
		user, scanErr := scanUser(rows)
		if scanErr != nil {
			http.Error(w, scanErr.Error(), http.StatusInternalServerError)
			return
		}
		user.LoginPassword = ""
		response = append(response, user)
	}
	if err = rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err = json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserController) GetByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	item, err := c.getUserByID(id)
	if err == sql.ErrNoRows {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	item.LoginPassword = ""

	if err = json.NewEncoder(w).Encode(item); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserController) Create(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload dto.UserDTO
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(payload.UserID) == "" {
		payload.UserID = strings.TrimSpace(payload.UserIDSnake)
	}
	if strings.TrimSpace(payload.FirstName) == "" ||
		strings.TrimSpace(payload.LastName) == "" ||
		strings.TrimSpace(payload.UserID) == "" ||
		strings.TrimSpace(payload.Email) == "" ||
		strings.TrimSpace(payload.MobileNo) == "" ||
		strings.TrimSpace(payload.LoginPassword) == "" {
		http.Error(w, "firstName, lastName, userId, email, mobileNo and loginPassword are required", http.StatusBadRequest)
		return
	}
	payload.FirstName = strings.TrimSpace(payload.FirstName)
	payload.LastName = strings.TrimSpace(payload.LastName)
	payload.UserID = strings.TrimSpace(payload.UserID)
	payload.Email = strings.TrimSpace(payload.Email)
	payload.MobileNo = strings.TrimSpace(payload.MobileNo)

	now := time.Now().UTC()
	if payload.UserRoleID == "" {
		payload.UserRoleID = defaultSignUpRoleID
	}
	userIDExists, err := c.userIDExists(payload.UserID, "")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if userIDExists {
		http.Error(w, "userID already exists", http.StatusConflict)
		return
	}
	var roleExists int
	if err := c.db.QueryRow(`SELECT COUNT(1) FROM dbo.user_role WHERE id = @p1 AND is_deleted = 0`, payload.UserRoleID).Scan(&roleExists); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if roleExists == 0 {
		http.Error(w, "default USER role not found. seed user roles first", http.StatusBadRequest)
		return
	}
	if payload.CreatedDate.IsZero() {
		payload.CreatedDate = now
	}
	if !payload.IsActive {
		payload.IsActive = true
	}
	mustChange := true
	if payload.MustChangePassword == nil {
		payload.MustChangePassword = &mustChange
	}
	payload.IsDeleted = false
	payload.UpdatedDate = now

	if payload.ID == "" {
		row := c.db.QueryRow(`SELECT CONVERT(VARCHAR(36), NEWID())`)
		if err := row.Scan(&payload.ID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	_, err = c.db.Exec(`
		INSERT INTO dbo.users (
			id, user_role_id, user_id, first_name, last_name, email, mobile_no, login_password,
			remark, last_login, is_active, is_deleted, created_date, updated_date, created_by, updated_by,
			must_change_password
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15, @p16, @p17
		)
	`,
		payload.ID,
		payload.UserRoleID,
		payload.UserID,
		payload.FirstName,
		payload.LastName,
		payload.Email,
		payload.MobileNo,
		payload.LoginPassword,
		nullIfEmpty(payload.Remark),
		nullTimeIfZero(payload.LastLogin),
		payload.IsActive,
		payload.IsDeleted,
		payload.CreatedDate,
		payload.UpdatedDate,
		nullIfEmpty(payload.CreatedBy),
		nullIfEmpty(payload.UpdatedBy),
		*payload.MustChangePassword,
	)
	if err != nil {
		if isUserIDViolation(err) {
			http.Error(w, "userID already exists", http.StatusConflict)
			return
		}
		if isUniqueViolation(err) {
			http.Error(w, "email already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	created, err := c.getUserByID(payload.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	created.LoginPassword = ""

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		"Admin",
		"ADMIN",
		"User Created",
		"User",
		payload.UserID,
		"",
		r.RemoteAddr,
		"Success",
		"Info",
		"User "+payload.UserID+" was created successfully",
	)

	// Send Welcome Email
	if c.mailer != nil {
		subject := "Welcome to Xentral ACMS - Account Created"
		body := fmt.Sprintf("Hello %s %s,\n\n"+
			"Your account on Xentral ACMS has been successfully created.\n\n"+
			"Login Username/ID: %s\n"+
			"Temporary Password: %s (Please use this to log in)\n\n"+
			"Note: For security reasons, you will be required to change your password upon your first login.\n\n"+
			"Regards,\n"+
			"Xentral ACMS Administration\n",
			payload.FirstName, payload.LastName, payload.UserID, payload.LoginPassword)
		_ = c.mailer.SendMail([]string{payload.Email}, subject, body)
	}

	w.WriteHeader(http.StatusCreated)
	if err = json.NewEncoder(w).Encode(created); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserController) Update(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload dto.UserDTO
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(payload.UserID) == "" {
		payload.UserID = strings.TrimSpace(payload.UserIDSnake)
	}

	existing, err := c.getUserByID(id)
	if err == sql.ErrNoRows {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	payload.ID = id
	if payload.CreatedDate.IsZero() {
		payload.CreatedDate = existing.CreatedDate
	}
	if payload.UserRoleID == "" {
		payload.UserRoleID = existing.UserRoleID
	}
	if strings.TrimSpace(payload.UserID) == "" {
		payload.UserID = existing.UserID
	}
	if payload.MustChangePassword == nil {
		payload.MustChangePassword = existing.MustChangePassword
	}
	if strings.TrimSpace(payload.FirstName) == "" {
		payload.FirstName = existing.FirstName
	}
	if strings.TrimSpace(payload.LastName) == "" {
		payload.LastName = existing.LastName
	}
	if strings.TrimSpace(payload.Email) == "" {
		payload.Email = existing.Email
	}
	if strings.TrimSpace(payload.MobileNo) == "" {
		payload.MobileNo = existing.MobileNo
	}
	if strings.TrimSpace(payload.LoginPassword) == "" {
		payload.LoginPassword = existing.LoginPassword
	}
	if strings.TrimSpace(payload.Remark) == "" {
		payload.Remark = existing.Remark
	}
	payload.UserID = strings.TrimSpace(payload.UserID)
	payload.Email = strings.TrimSpace(payload.Email)
	payload.FirstName = strings.TrimSpace(payload.FirstName)
	payload.LastName = strings.TrimSpace(payload.LastName)
	payload.MobileNo = strings.TrimSpace(payload.MobileNo)
	if payload.LastLogin.IsZero() {
		payload.LastLogin = existing.LastLogin
	}
	payload.IsDeleted = existing.IsDeleted
	payload.UpdatedDate = time.Now().UTC()
	userIDExists, err := c.userIDExists(payload.UserID, payload.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if userIDExists {
		http.Error(w, "userID already exists", http.StatusConflict)
		return
	}

	result, err := c.db.Exec(`
		UPDATE dbo.users
		SET user_role_id = @p2,
		    user_id = @p3,
		    first_name = @p4,
		    last_name = @p5,
		    email = @p6,
		    mobile_no = @p7,
		    login_password = @p8,
		    remark = @p9,
		    last_login = @p10,
		    is_active = @p11,
		    updated_date = @p12,
		    updated_by = @p13,
		    must_change_password = @p14
		WHERE id = @p1 AND is_deleted = 0
	`,
		payload.ID,
		payload.UserRoleID,
		payload.UserID,
		payload.FirstName,
		payload.LastName,
		payload.Email,
		payload.MobileNo,
		payload.LoginPassword,
		nullIfEmpty(payload.Remark),
		nullTimeIfZero(payload.LastLogin),
		payload.IsActive,
		payload.UpdatedDate,
		nullIfEmpty(payload.UpdatedBy),
		*payload.MustChangePassword,
	)
	if err != nil {
		if isUserIDViolation(err) {
			http.Error(w, "userID already exists", http.StatusConflict)
			return
		}
		if isUniqueViolation(err) {
			http.Error(w, "email already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if rowsAffected == 0 {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	updated, err := c.getUserByID(payload.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	updated.LoginPassword = ""

	// Audit Log
	action := "User Edited"
	details := "User " + payload.UserID + " was updated successfully"
	if existing.IsActive && !payload.IsActive {
		action = "User Disabled"
		details = "User " + payload.UserID + " was disabled"
	} else if !existing.IsActive && payload.IsActive {
		action = "User Enabled"
		details = "User " + payload.UserID + " was enabled"
	} else if existing.UserRoleID != payload.UserRoleID {
		action = "User Role Changed"
		details = "User " + payload.UserID + " role was updated"
	}

	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		"Admin",
		"ADMIN",
		action,
		"User",
		payload.UserID,
		"",
		r.RemoteAddr,
		"Success",
		"Info",
		details,
	)

	// Send Password Reset Email if Admin Reset Password
	if c.mailer != nil && payload.LoginPassword != existing.LoginPassword && *payload.MustChangePassword {
		subject := "Xentral ACMS - Password Reset"
		body := fmt.Sprintf("Hello %s %s,\n\n"+
			"Your account password on Xentral ACMS has been reset by an administrator.\n\n"+
			"Login Username/ID: %s\n"+
			"Temporary Password: %s (Please use this to log in)\n\n"+
			"Note: For security reasons, you will be required to change your password upon your first login.\n\n"+
			"Regards,\n"+
			"Xentral ACMS Administration\n",
			payload.FirstName, payload.LastName, payload.UserID, payload.LoginPassword)
		_ = c.mailer.SendMail([]string{payload.Email}, subject, body)
	}

	if err = json.NewEncoder(w).Encode(updated); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserController) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	// Protect any account that holds the SUPER_ADMIN role
	const superAdminRoleID = "00000000-0000-0000-0000-000000000001"
	var roleID string
	if err := c.db.QueryRow(
		`SELECT LOWER(CONVERT(VARCHAR(36), user_role_id)) FROM dbo.users WHERE id = @p1 AND is_deleted = 0`, id,
	).Scan(&roleID); err == sql.ErrNoRows {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if strings.EqualFold(roleID, superAdminRoleID) {
		http.Error(w, "The Super Admin account cannot be deleted", http.StatusForbidden)
		return
	}

	// Get username before deleting for audit log
	var username string
	_ = c.db.QueryRow(`SELECT user_id FROM dbo.users WHERE id = @p1`, id).Scan(&username)

	// Check if this user is referenced in logs, tickets, session audits, or user images
	var isReferenced bool
	var count int

	// Check tickets
	_ = c.db.QueryRow(`
		SELECT COUNT(1) FROM dbo.Ticket 
		WHERE requesterid = @p1 OR requesterid = @p2 OR approverid = @p1 OR approverid = @p2
	`, id, username).Scan(&count)
	if count > 0 {
		isReferenced = true
	}

	// Check sessions
	if !isReferenced {
		_ = c.db.QueryRow(`
			SELECT COUNT(1) FROM dbo.SessionAudit 
			WHERE UserID = @p1 OR UserID = @p2
		`, id, username).Scan(&count)
		if count > 0 {
			isReferenced = true
		}
	}

	// Check audit log references
	if !isReferenced {
		_ = c.db.QueryRow(`
			SELECT COUNT(1) FROM dbo.AuditLog 
			WHERE Actor = @p1 OR TargetName = @p1 OR TargetName = @p2 OR Details LIKE '%' + @p1 + '%' OR Details LIKE '%' + @p2 + '%'
		`, username, id).Scan(&count)
		if count > 0 {
			isReferenced = true
		}
	}

	// Check user image references
	if !isReferenced {
		_ = c.db.QueryRow(`
			SELECT COUNT(1) FROM dbo.user_image 
			WHERE user_id = @p1
		`, id).Scan(&count)
		if count > 0 {
			isReferenced = true
		}
	}

	var errDelete error
	var actionTaken string
	var rowsAffected int64

	if isReferenced {
		// Soft delete
		result, err := c.db.Exec(`
			UPDATE dbo.users
			SET is_deleted = 1, updated_date = @p2
			WHERE id = @p1 AND is_deleted = 0
		`, id, time.Now().UTC())
		errDelete = err
		if err == nil {
			rowsAffected, _ = result.RowsAffected()
		}
		actionTaken = "soft-deleted"
	} else {
		// Hard delete (remove completely from database since there is no reference history)
		result, err := c.db.Exec(`
			DELETE FROM dbo.users
			WHERE id = @p1 AND is_deleted = 0
		`, id)
		errDelete = err
		if err == nil {
			rowsAffected, _ = result.RowsAffected()
		}
		actionTaken = "permanently deleted"
	}

	if errDelete != nil {
		http.Error(w, errDelete.Error(), http.StatusInternalServerError)
		return
	}
	if rowsAffected == 0 {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// Audit Log
	if username != "" {
		auditLogger := NewAuditLogController(c.db)
		_ = auditLogger.LogEvent(
			"Admin",
			"ADMIN",
			"User Deleted",
			"User",
			username,
			"",
			r.RemoteAddr,
			"Success",
			"Warning",
			"User "+username+" was "+actionTaken+" successfully",
		)
	}

	w.WriteHeader(http.StatusNoContent)
}

// Disable sets is_active = 0 without deleting the user record.
// Any user holding the SUPER_ADMIN role cannot be disabled.
func (c *UserController) Disable(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	// Protect any account that holds the SUPER_ADMIN role
	const superAdminRoleID = "00000000-0000-0000-0000-000000000001"
	var roleID string
	if err := c.db.QueryRow(
		`SELECT LOWER(CONVERT(VARCHAR(36), user_role_id)) FROM dbo.users WHERE id = @p1 AND is_deleted = 0`, id,
	).Scan(&roleID); err == sql.ErrNoRows {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if strings.EqualFold(roleID, superAdminRoleID) {
		http.Error(w, "The Super Admin account cannot be disabled", http.StatusForbidden)
		return
	}

	// Get username for audit log
	var username string
	_ = c.db.QueryRow(`SELECT user_id FROM dbo.users WHERE id = @p1`, id).Scan(&username)

	result, err := c.db.Exec(`
		UPDATE dbo.users
		SET is_active = 0, updated_date = @p2
		WHERE id = @p1 AND is_deleted = 0
	`, id, time.Now().UTC())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// Audit Log
	if username != "" {
		auditLogger := NewAuditLogController(c.db)
		_ = auditLogger.LogEvent(
			"Admin",
			"ADMIN",
			"User Disabled",
			"User",
			username,
			"",
			r.RemoteAddr,
			"Success",
			"Info",
			"User "+username+" was disabled",
		)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "User disabled successfully"})
}

// Enable sets is_active = 1 to re-activate a previously disabled user.
func (c *UserController) Enable(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	// Get username for audit log
	var username2 string
	_ = c.db.QueryRow(`SELECT user_id FROM dbo.users WHERE id = @p1`, id).Scan(&username2)

	result, err := c.db.Exec(`
		UPDATE dbo.users
		SET is_active = 1, updated_date = @p2
		WHERE id = @p1 AND is_deleted = 0
	`, id, time.Now().UTC())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// Audit Log
	if username2 != "" {
		auditLogger := NewAuditLogController(c.db)
		_ = auditLogger.LogEvent(
			"Admin",
			"ADMIN",
			"User Enabled",
			"User",
			username2,
			"",
			r.RemoteAddr,
			"Success",
			"Info",
			"User "+username2+" was enabled",
		)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "User enabled successfully"})
}

// ChangeRole updates the user_role_id. Only Super Admin should call this endpoint (enforced by frontend role gating).
// Any user holding the SUPER_ADMIN role cannot have their role changed via this endpoint.
func (c *UserController) ChangeRole(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload struct {
		RoleID string `json:"roleId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || strings.TrimSpace(payload.RoleID) == "" {
		http.Error(w, "roleId is required", http.StatusBadRequest)
		return
	}

	// Protect any account that holds the SUPER_ADMIN role
	const superAdminRoleID = "00000000-0000-0000-0000-000000000001"
	var currentRoleID string
	if err := c.db.QueryRow(
		`SELECT LOWER(CONVERT(VARCHAR(36), user_role_id)) FROM dbo.users WHERE id = @p1 AND is_deleted = 0`, id,
	).Scan(&currentRoleID); err == sql.ErrNoRows {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if strings.EqualFold(currentRoleID, superAdminRoleID) {
		http.Error(w, "The Super Admin account role cannot be changed", http.StatusForbidden)
		return
	}

	// SUPER_ADMIN is a singleton role — it cannot be assigned to any other user
	if strings.EqualFold(payload.RoleID, superAdminRoleID) {
		http.Error(w, "Super Admin is a reserved singleton role and cannot be assigned to other users", http.StatusForbidden)
		return
	}

	// Get username for audit log
	var username string
	_ = c.db.QueryRow(`SELECT user_id FROM dbo.users WHERE id = @p1`, id).Scan(&username)

	result, err := c.db.Exec(`
		UPDATE dbo.users
		SET user_role_id = @p2, updated_date = @p3
		WHERE id = @p1 AND is_deleted = 0
	`, id, payload.RoleID, time.Now().UTC())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		http.Error(w, "user not found or role unchanged", http.StatusNotFound)
		return
	}

	// Audit Log
	if username != "" {
		auditLogger := NewAuditLogController(c.db)
		_ = auditLogger.LogEvent(
			"Admin",
			"ADMIN",
			"User Role Changed",
			"User",
			username,
			"",
			r.RemoteAddr,
			"Success",
			"Info",
			"User "+username+" role was updated",
		)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "User role updated successfully"})
}

func (c *UserController) Login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload struct {
		UserID   string `json:"userId"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	payload.UserID = strings.TrimSpace(payload.UserID)
	payload.Password = strings.TrimSpace(payload.Password)

	if payload.UserID == "" || payload.Password == "" {
		http.Error(w, "userID and password are required", http.StatusBadRequest)
		return
	}

	row := c.db.QueryRow(`
		SELECT
			CONVERT(VARCHAR(36), id) as id, CONVERT(VARCHAR(36), user_role_id) as user_role_id, user_id, first_name, last_name, email, mobile_no, login_password,
			remark, last_login, is_active, is_deleted, created_date, updated_date, CONVERT(VARCHAR(36), created_by) as created_by, CONVERT(VARCHAR(36), updated_by) as updated_by,
			must_change_password
		FROM dbo.users
		WHERE (user_id = @p1 OR email = @p1) AND is_deleted = 0
	`, payload.UserID)

	user, err := scanUser(row)
	if err == sql.ErrNoRows {
		_, _ = c.db.Exec(`
			INSERT INTO dbo.AuditLog (
				Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, SourceIP, Result, Severity, Details
			) VALUES (
				@p1, @p2, 'GUEST', 'Failed Login', 'User', @p2, @p3, 'Failure', 'Warning', 'Failed login attempt: invalid credentials'
			)
		`, time.Now().UTC(), payload.UserID, r.RemoteAddr)
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Basic plain-text password check for prototype
	if user.LoginPassword != payload.Password {
		_, _ = c.db.Exec(`
			INSERT INTO dbo.AuditLog (
				Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, SourceIP, Result, Severity, Details
			) VALUES (
				@p1, @p2, 'GUEST', 'Failed Login', 'User', @p2, @p3, 'Failure', 'Warning', 'Failed login attempt: invalid credentials'
			)
		`, time.Now().UTC(), payload.UserID, r.RemoteAddr)
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if !user.IsActive {
		_, _ = c.db.Exec(`
			INSERT INTO dbo.AuditLog (
				Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, SourceIP, Result, Severity, Details
			) VALUES (
				@p1, @p2, 'GUEST', 'Failed Login', 'User', @p2, @p3, 'Failure', 'Warning', 'Failed login attempt: account is disabled'
			)
		`, time.Now().UTC(), user.UserID, r.RemoteAddr)
		http.Error(w, "Account is disabled. Contact your administrator.", http.StatusForbidden)
		return
	}

	// Update last login
	_, _ = c.db.Exec(`UPDATE dbo.users SET last_login = @p1 WHERE id = @p2`, time.Now().UTC(), user.ID)

	// Fetch role name for audit log
	var roleName string
	_ = c.db.QueryRow("SELECT role_name FROM dbo.user_role WHERE id = @p1", user.UserRoleID).Scan(&roleName)
	if roleName == "" {
		roleName = "USER"
	}

	// Audit successful login
	_, _ = c.db.Exec(`
		INSERT INTO dbo.AuditLog (
			Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, SourceIP, Result, Severity, Details
		) VALUES (
			@p1, @p2, @p3, 'Successful Login', 'User', @p2, @p4, 'Success', 'Info', 'User successfully logged in'
		)
	`, time.Now().UTC(), user.UserID, roleName, r.RemoteAddr)

	// Don't send password back to client
	user.LoginPassword = ""
	
	if err = json.NewEncoder(w).Encode(user); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserController) getUserByID(id string) (dto.UserDTO, error) {
	row := c.db.QueryRow(`
		SELECT
			CONVERT(VARCHAR(36), id) as id, CONVERT(VARCHAR(36), user_role_id) as user_role_id, user_id, first_name, last_name, email, mobile_no, login_password,
			remark, last_login, is_active, is_deleted, created_date, updated_date, CONVERT(VARCHAR(36), created_by) as created_by, CONVERT(VARCHAR(36), updated_by) as updated_by,
			must_change_password
		FROM dbo.users
		WHERE id = @p1 AND is_deleted = 0
	`, id)
	return scanUser(row)
}

type userScanner interface {
	Scan(dest ...any) error
}

func scanUser(scanner userScanner) (dto.UserDTO, error) {
	var user dto.UserDTO
	var remark sql.NullString
	var lastLogin sql.NullTime
	var createdBy sql.NullString
	var updatedBy sql.NullString
	var mustChangeVal bool

	err := scanner.Scan(
		&user.ID,
		&user.UserRoleID,
		&user.UserID,
		&user.FirstName,
		&user.LastName,
		&user.Email,
		&user.MobileNo,
		&user.LoginPassword,
		&remark,
		&lastLogin,
		&user.IsActive,
		&user.IsDeleted,
		&user.CreatedDate,
		&user.UpdatedDate,
		&createdBy,
		&updatedBy,
		&mustChangeVal,
	)
	if err != nil {
		return dto.UserDTO{}, err
	}
	user.MustChangePassword = &mustChangeVal

	if remark.Valid {
		user.Remark = remark.String
	}
	if lastLogin.Valid {
		user.LastLogin = lastLogin.Time
	}
	if createdBy.Valid {
		user.CreatedBy = createdBy.String
	}
	if updatedBy.Valid {
		user.UpdatedBy = updatedBy.String
	}

	return user, nil
}

func nullIfEmpty(value string) sql.NullString {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: trimmed, Valid: true}
}

func nullTimeIfZero(value time.Time) sql.NullTime {
	if value.IsZero() {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: value, Valid: true}
}

func isUniqueViolation(err error) bool {
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "duplicate") ||
		strings.Contains(lower, "unique constraint") ||
		strings.Contains(lower, "2601") ||
		strings.Contains(lower, "2627")
}

func isUserIDViolation(err error) bool {
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "userid already exists") ||
		strings.Contains(lower, "user_id")
}

func (c *UserController) userIDExists(userID, excludeID string) (bool, error) {
	if strings.TrimSpace(excludeID) == "" {
		var count int
		err := c.db.QueryRow(`SELECT COUNT(1) FROM dbo.users WHERE user_id = @p1 AND is_deleted = 0`, userID).Scan(&count)
		if err != nil {
			return false, err
		}
		return count > 0, nil
	}

	var count int
	err := c.db.QueryRow(`SELECT COUNT(1) FROM dbo.users WHERE user_id = @p1 AND id <> @p2 AND is_deleted = 0`, userID, excludeID).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (c *UserController) Logout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var payload struct {
		UserID string `json:"userId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&payload)

	if payload.UserID != "" {
		var roleName string
		_ = c.db.QueryRow("SELECT ur.role_name FROM dbo.users u JOIN dbo.user_role ur ON ur.id = u.user_role_id WHERE u.user_id = @p1", payload.UserID).Scan(&roleName)
		if roleName == "" {
			roleName = "USER"
		}

		_, _ = c.db.Exec(`
			INSERT INTO dbo.AuditLog (
				Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, SourceIP, Result, Severity, Details
			) VALUES (
				@p1, @p2, @p3, 'Logout', 'User', @p2, @p4, 'Success', 'Info', 'User logged out'
			)
		`, time.Now().UTC(), payload.UserID, roleName, r.RemoteAddr)
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Logged out successfully"})
}

type AccountSupportRequest struct {
	Email             string `json:"email"`
	FirstName         string `json:"firstName"`
	LastName          string `json:"lastName"`
	RequestedUsername string `json:"requestedUsername"`
	RequestType       string `json:"requestType"`
	Message           string `json:"message"`
}

func (c *UserController) RequestAccountSupport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload AccountSupportRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	payload.Email = strings.TrimSpace(payload.Email)
	payload.FirstName = strings.TrimSpace(payload.FirstName)
	payload.LastName = strings.TrimSpace(payload.LastName)
	payload.RequestedUsername = strings.TrimSpace(payload.RequestedUsername)
	payload.RequestType = strings.TrimSpace(payload.RequestType)
	payload.Message = strings.TrimSpace(payload.Message)

	if payload.Email == "" || payload.FirstName == "" || payload.LastName == "" || payload.RequestType == "" {
		http.Error(w, "email, firstName, lastName, and requestType are required fields", http.StatusBadRequest)
		return
	}

	// Verify if email/username already exists for active accounts
	if payload.RequestType != "Password/UserID Reset" {
		var emailExists int
		err := c.db.QueryRow(`SELECT COUNT(1) FROM dbo.users WHERE email = @p1 AND is_deleted = 0`, payload.Email).Scan(&emailExists)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if emailExists > 0 {
			http.Error(w, "An active account with this email already exists", http.StatusConflict)
			return
		}

		if payload.RequestedUsername != "" {
			var usernameExists int
			err = c.db.QueryRow(`SELECT COUNT(1) FROM dbo.users WHERE user_id = @p1 AND is_deleted = 0`, payload.RequestedUsername).Scan(&usernameExists)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			if usernameExists > 0 {
				http.Error(w, "An active account with this username already exists", http.StatusConflict)
				return
			}
		}
	} else {
		var emailExists int
		err := c.db.QueryRow(`SELECT COUNT(1) FROM dbo.users WHERE email = @p1 AND is_deleted = 0`, payload.Email).Scan(&emailExists)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if emailExists == 0 {
			http.Error(w, "No active account found with this email", http.StatusNotFound)
			return
		}
	}

	// Generate request ID
	var requestID string
	err := c.db.QueryRow(`SELECT CONVERT(VARCHAR(36), NEWID())`).Scan(&requestID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC()

	// Insert into dbo.account_requests
	_, err = c.db.Exec(`
		INSERT INTO dbo.account_requests (
			id, first_name, last_name, email, mobile_no, requested_username, request_type, message, status, created_date, updated_date
		) VALUES (
			@p1, @p2, @p3, @p4, NULL, @p5, @p6, @p7, 'PENDING', @p8, @p9
		)
	`, requestID, payload.FirstName, payload.LastName, payload.Email, payload.RequestedUsername, payload.RequestType, nullIfEmpty(payload.Message), now, now)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	details := "Name: " + payload.FirstName + " " + payload.LastName
	if payload.RequestedUsername != "" {
		details += " | Proposed UserID: " + payload.RequestedUsername
	}
	if payload.Message != "" {
		details += " | Message: " + payload.Message
	}

	// Insert into AuditLog
	_, _ = c.db.Exec(`
		INSERT INTO dbo.AuditLog (
			Timestamp, Actor, ActorRole, ActionType, TargetType, TargetName, SourceIP, Result, Severity, Details
		) VALUES (
			@p1, @p2, 'GUEST', 'Account Request', 'Account', @p3, @p4, 'Success', 'Info', @p5
		)
	`, now, payload.Email, payload.RequestType, r.RemoteAddr, details)

	// Send Support Confirmation Email
	if c.mailer != nil {
		subject := "Xentral ACMS - Support Request Received"
		body := fmt.Sprintf("Hello %s %s,\n\n"+
			"We have received your request for Xentral ACMS account support.\n\n"+
			"Request Type: %s\n"+
			"Proposed Username: %s\n"+
			"Message: %s\n\n"+
			"Our administrator will review your request and get back to you shortly.\n\n"+
			"Regards,\n"+
			"Xentral ACMS Administration\n",
			payload.FirstName, payload.LastName, payload.RequestType, payload.RequestedUsername, payload.Message)
		_ = c.mailer.SendMail([]string{payload.Email}, subject, body)
	}

	// Notify admins and broadcast counts
	go func() {
		msg := fmt.Sprintf("New account support request ('%s') from %s %s.", payload.RequestType, payload.FirstName, payload.LastName)
		_ = AddNotification(c.db, "ROLE_ADMIN", "Account Support Request", msg, "/account-requests")
		BroadcastPendingCountsUpdate()
	}()

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"message": "Support request submitted successfully"})
}

func (c *UserController) GetSetupStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var count int
	err := c.db.QueryRow(`
		SELECT COUNT(1) 
		FROM dbo.users 
		WHERE user_id = 'admin' 
		  AND email = 'admin@xentralacms.local' 
		  AND is_deleted = 0
	`).Scan(&count)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	setupCompleted := (count == 0)

	json.NewEncoder(w).Encode(map[string]bool{
		"setupCompleted": setupCompleted,
	})
}

func (c *UserController) ListAccountRequests(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	rows, err := c.db.Query(`
		SELECT 
			CONVERT(VARCHAR(36), id) as id, first_name, last_name, email, ISNULL(mobile_no, '') as mobile_no, 
			requested_username, request_type, ISNULL(message, '') as message, status, created_date, updated_date
		FROM dbo.account_requests
		ORDER BY created_date DESC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	response := make([]dto.AccountRequestDTO, 0)
	for rows.Next() {
		var req dto.AccountRequestDTO
		err := rows.Scan(
			&req.ID, &req.FirstName, &req.LastName, &req.Email, &req.MobileNo,
			&req.RequestedUsername, &req.RequestType, &req.Message, &req.Status, &req.CreatedDate, &req.UpdatedDate,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		response = append(response, req)
	}

	if err = json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserController) ApproveAccountRequest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	// Get request details
	var req dto.AccountRequestDTO
	err := c.db.QueryRow(`
		SELECT 
			CONVERT(VARCHAR(36), id) as id, first_name, last_name, email, ISNULL(mobile_no, '') as mobile_no, 
			requested_username, request_type, ISNULL(message, '') as message, status, created_date, updated_date
		FROM dbo.account_requests
		WHERE id = @p1
	`, id).Scan(
		&req.ID, &req.FirstName, &req.LastName, &req.Email, &req.MobileNo,
		&req.RequestedUsername, &req.RequestType, &req.Message, &req.Status, &req.CreatedDate, &req.UpdatedDate,
	)
	if err == sql.ErrNoRows {
		http.Error(w, "account request not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if req.Status != "PENDING" {
		http.Error(w, "request has already been processed", http.StatusBadRequest)
		return
	}

	// If this is a Password/UserID Reset, we will reset the existing user's password
	if req.RequestType == "Password/UserID Reset" {
		// Try to find the user by email or username
		var userID string
		var userEmail string
		var userFirstName string
		var userLastName string
		err = c.db.QueryRow(`
			SELECT CONVERT(VARCHAR(36), id), email, first_name, last_name 
			FROM dbo.users 
			WHERE (user_id = @p1 OR email = @p2) AND is_deleted = 0
		`, req.RequestedUsername, req.Email).Scan(&userID, &userEmail, &userFirstName, &userLastName)
		
		if err == sql.ErrNoRows {
			http.Error(w, "associated user account not found to perform reset", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Generate random temporary password
		tempPass := "Temp" + fmt.Sprintf("%d", time.Now().UnixNano()%1000000)

		// Update user password and set must_change_password = 1
		_, err = c.db.Exec(`
			UPDATE dbo.users 
			SET login_password = @p2, must_change_password = 1, updated_date = @p3
			WHERE id = @p1
		`, userID, tempPass, time.Now().UTC())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Update status to APPROVED
		_, err = c.db.Exec(`
			UPDATE dbo.account_requests 
			SET status = 'APPROVED', updated_date = @p2
			WHERE id = @p1
		`, id, time.Now().UTC())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Send reset welcome email
		if c.mailer != nil {
			subject := "Xentral ACMS - Password Reset Approved"
			body := fmt.Sprintf("Hello %s %s,\n\n"+
				"Your password reset request for Xentral ACMS has been approved.\n\n"+
				"Login Username/ID: %s\n"+
				"Temporary Password: %s (Please use this to log in)\n\n"+
				"Note: For security reasons, you will be required to change your password upon your first login.\n\n"+
				"Regards,\n"+
				"Xentral ACMS Administration\n",
				userFirstName, userLastName, req.RequestedUsername, tempPass)
			_ = c.mailer.SendMail([]string{userEmail}, subject, body)
		}

		go func() {
			BroadcastPendingCountsUpdate()
		}()

		json.NewEncoder(w).Encode(map[string]string{"message": "Password reset approved successfully"})
		return
	}

	// Otherwise, it is an Account Registration. Check if username/email already exists
	var userExists int
	err = c.db.QueryRow(`
		SELECT COUNT(1) FROM dbo.users WHERE (user_id = @p1 OR email = @p2) AND is_deleted = 0
	`, req.RequestedUsername, req.Email).Scan(&userExists)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if userExists > 0 {
		http.Error(w, "A user with this username or email already exists", http.StatusConflict)
		return
	}

	// Generate random temporary password
	tempPass := "Temp" + fmt.Sprintf("%d", time.Now().UnixNano()%1000000)

	// Generate new user ID
	var newUserID string
	err = c.db.QueryRow(`SELECT CONVERT(VARCHAR(36), NEWID())`).Scan(&newUserID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	now := time.Now().UTC()

	// Insert new user into dbo.users
	_, err = c.db.Exec(`
		INSERT INTO dbo.users (
			id, user_role_id, user_id, first_name, last_name, email, mobile_no, login_password,
			remark, last_login, is_active, is_deleted, created_date, updated_date, created_by, updated_by,
			must_change_password
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, 'Approved from request', NULL, 1, 0, @p9, @p10, 'ADMIN', 'ADMIN', 1
		)
	`, newUserID, defaultSignUpRoleID, req.RequestedUsername, req.FirstName, req.LastName, req.Email, req.MobileNo, tempPass, now, now)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Update status to APPROVED
	_, err = c.db.Exec(`
		UPDATE dbo.account_requests 
		SET status = 'APPROVED', updated_date = @p2
		WHERE id = @p1
	`, id, now)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Send Welcome Email
	if c.mailer != nil {
		subject := "Welcome to Xentral ACMS - Account Request Approved"
		body := fmt.Sprintf("Hello %s %s,\n\n"+
			"Your account request for Xentral ACMS has been approved.\n\n"+
			"Login Username/ID: %s\n"+
			"Temporary Password: %s (Please use this to log in)\n\n"+
			"Note: For security reasons, you will be required to change your password upon your first login.\n\n"+
			"Regards,\n"+
			"Xentral ACMS Administration\n",
			req.FirstName, req.LastName, req.RequestedUsername, tempPass)
		_ = c.mailer.SendMail([]string{req.Email}, subject, body)
	}

	go func() {
		BroadcastPendingCountsUpdate()
	}()

	json.NewEncoder(w).Encode(map[string]string{"message": "Account request approved and user created"})
}

func (c *UserController) DenyAccountRequest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	// Get request details
	var req dto.AccountRequestDTO
	err := c.db.QueryRow(`
		SELECT 
			CONVERT(VARCHAR(36), id) as id, first_name, last_name, email, ISNULL(mobile_no, '') as mobile_no, 
			requested_username, request_type, ISNULL(message, '') as message, status, created_date, updated_date
		FROM dbo.account_requests
		WHERE id = @p1
	`, id).Scan(
		&req.ID, &req.FirstName, &req.LastName, &req.Email, &req.MobileNo,
		&req.RequestedUsername, &req.RequestType, &req.Message, &req.Status, &req.CreatedDate, &req.UpdatedDate,
	)
	if err == sql.ErrNoRows {
		http.Error(w, "account request not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if req.Status != "PENDING" {
		http.Error(w, "request has already been processed", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()

	// Update status to DENIED
	_, err = c.db.Exec(`
		UPDATE dbo.account_requests 
		SET status = 'DENIED', updated_date = @p2
		WHERE id = @p1
	`, id, now)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Send Denial Email
	if c.mailer != nil {
		subject := "Xentral ACMS - Support Request Declined"
		body := fmt.Sprintf("Hello %s %s,\n\n"+
			"Thank you for contacting Xentral ACMS support.\n\n"+
			"Your support request of type '%s' has been reviewed and declined by our administrator.\n\n"+
			"If you believe this was an error, please contact your administrator directly.\n\n"+
			"Regards,\n"+
			"Xentral ACMS Administration\n",
			req.FirstName, req.LastName, req.RequestType)
		_ = c.mailer.SendMail([]string{req.Email}, subject, body)
	}

	go func() {
		BroadcastPendingCountsUpdate()
	}()

	json.NewEncoder(w).Encode(map[string]string{"message": "Account request declined"})
}

type SMTPProfilePayload struct {
	ID          int    `json:"id"`
	ProfileName string `json:"profileName"`
	Enabled     bool   `json:"enabled"`
	Host        string `json:"host"`
	Port        string `json:"port"`
	Username    string `json:"username"`
	Password    string `json:"password"`
	SenderFrom  string `json:"senderFrom"`
	IsActive    bool   `json:"isActive"`
}

func (c *UserController) ListSMTPProfiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	rows, err := c.db.Query(`
		SELECT id, profile_name, enabled, host, port, username, password, sender_from, is_active
		FROM dbo.smtp_settings
		ORDER BY id ASC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	response := make([]SMTPProfilePayload, 0)
	for rows.Next() {
		var p SMTPProfilePayload
		err := rows.Scan(&p.ID, &p.ProfileName, &p.Enabled, &p.Host, &p.Port, &p.Username, &p.Password, &p.SenderFrom, &p.IsActive)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		response = append(response, p)
	}

	if err = json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserController) CreateSMTPProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload SMTPProfilePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	payload.ProfileName = strings.TrimSpace(payload.ProfileName)
	payload.Host = strings.TrimSpace(payload.Host)
	payload.Port = strings.TrimSpace(payload.Port)
	payload.Username = strings.TrimSpace(payload.Username)
	payload.Password = strings.TrimSpace(payload.Password)
	payload.SenderFrom = strings.TrimSpace(payload.SenderFrom)

	if payload.ProfileName == "" || payload.Host == "" || payload.Port == "" || payload.SenderFrom == "" {
		http.Error(w, "profileName, host, port, and senderFrom are required", http.StatusBadRequest)
		return
	}

	var count int
	_ = c.db.QueryRow("SELECT COUNT(1) FROM dbo.smtp_settings").Scan(&count)
	if count == 0 {
		payload.IsActive = true
	}

	var newID int
	err := c.db.QueryRow(`
		INSERT INTO dbo.smtp_settings (profile_name, enabled, host, port, username, password, sender_from, is_active, updated_date)
		OUTPUT INSERTED.id
		VALUES (@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9)
	`, payload.ProfileName, payload.Enabled, payload.Host, payload.Port, payload.Username, payload.Password, payload.SenderFrom, payload.IsActive, time.Now().UTC()).Scan(&newID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if payload.IsActive {
		_, _ = c.db.Exec("UPDATE dbo.smtp_settings SET is_active = 0 WHERE id <> @p1", newID)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"message": "SMTP profile created successfully", "id": newID})
}

func (c *UserController) UpdateSMTPProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload SMTPProfilePayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	payload.ProfileName = strings.TrimSpace(payload.ProfileName)
	payload.Host = strings.TrimSpace(payload.Host)
	payload.Port = strings.TrimSpace(payload.Port)
	payload.Username = strings.TrimSpace(payload.Username)
	payload.Password = strings.TrimSpace(payload.Password)
	payload.SenderFrom = strings.TrimSpace(payload.SenderFrom)

	if payload.ProfileName == "" || payload.Host == "" || payload.Port == "" || payload.SenderFrom == "" {
		http.Error(w, "profileName, host, port, and senderFrom are required", http.StatusBadRequest)
		return
	}

	_, err := c.db.Exec(`
		UPDATE dbo.smtp_settings
		SET profile_name = @p2,
		    enabled = @p3,
		    host = @p4,
		    port = @p5,
		    username = @p6,
		    password = @p7,
		    sender_from = @p8,
		    is_active = @p9,
		    updated_date = @p10
		WHERE id = @p1
	`, id, payload.ProfileName, payload.Enabled, payload.Host, payload.Port, payload.Username, payload.Password, payload.SenderFrom, payload.IsActive, time.Now().UTC())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if payload.IsActive {
		_, _ = c.db.Exec("UPDATE dbo.smtp_settings SET is_active = 0 WHERE id <> @p1", id)
	}

	json.NewEncoder(w).Encode(map[string]string{"message": "SMTP profile updated successfully"})
}

func (c *UserController) DeleteSMTPProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var isActive bool
	err := c.db.QueryRow("SELECT is_active FROM dbo.smtp_settings WHERE id = @p1", id).Scan(&isActive)
	if err == sql.ErrNoRows {
		http.Error(w, "profile not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if isActive {
		http.Error(w, "Cannot delete the active SMTP profile. Activate another profile first.", http.StatusForbidden)
		return
	}

	_, err = c.db.Exec("DELETE FROM dbo.smtp_settings WHERE id = @p1", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"message": "SMTP profile deleted successfully"})
}

func (c *UserController) ActivateSMTPProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	_, err := c.db.Exec("UPDATE dbo.smtp_settings SET is_active = 1 WHERE id = @p1", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	_, _ = c.db.Exec("UPDATE dbo.smtp_settings SET is_active = 0 WHERE id <> @p1", id)

	json.NewEncoder(w).Encode(map[string]string{"message": "SMTP profile activated successfully"})
}

func (c *UserController) TestSMTPSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload struct {
		Recipient  string `json:"recipient"`
		Enabled    bool   `json:"enabled"`
		Host       string `json:"host"`
		Port       string `json:"port"`
		Username   string `json:"username"`
		Password   string `json:"password"`
		SenderFrom string `json:"senderFrom"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	payload.Recipient = strings.TrimSpace(payload.Recipient)
	payload.Host = strings.TrimSpace(payload.Host)
	payload.Port = strings.TrimSpace(payload.Port)
	payload.Username = strings.TrimSpace(payload.Username)
	payload.Password = strings.TrimSpace(payload.Password)
	payload.SenderFrom = strings.TrimSpace(payload.SenderFrom)

	if payload.Recipient == "" || payload.Host == "" || payload.Port == "" || payload.SenderFrom == "" {
		http.Error(w, "recipient, host, port, and senderFrom are required", http.StatusBadRequest)
		return
	}

	testMailer := mail.NewMailer(nil, &config.SMTPConfig{
		Enabled:  payload.Enabled,
		Host:     payload.Host,
		Port:     payload.Port,
		Username: payload.Username,
		Password: payload.Password,
		From:     payload.SenderFrom,
	})

	subject := "Xentral ACMS - SMTP Test Connection"
	body := fmt.Sprintf("Hello,\n\n"+
		"This is a test email sent from Xentral ACMS to verify your SMTP configuration.\n\n"+
		"Connection Details:\n"+
		"- Host: %s\n"+
		"- Port: %s\n"+
		"- Username: %s\n"+
		"- Enabled: %v\n\n"+
		"If you received this email, your configuration is correct and ready for use.\n\n"+
		"Regards,\n"+
		"Xentral ACMS System\n",
		payload.Host, payload.Port, payload.Username, payload.Enabled)

	err := testMailer.SendMail([]string{payload.Recipient}, subject, body)
	if err != nil {
		http.Error(w, "Connection failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"message": "Test email sent successfully! Please check your inbox (or log file if disabled)."})
}

func (c *UserController) DebugLog(w http.ResponseWriter, r *http.Request) {
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
		log.Printf("[BROWSER ERROR] URL: %v | Error: %v | Stack: %v", payload["url"], payload["message"], payload["stack"])
	}
	w.WriteHeader(http.StatusOK)
}

type SystemSettingsPayload struct {
	InactivityTimeoutMinutes int  `json:"inactivityTimeoutMinutes"`
	MinPasswordLength        int  `json:"minPasswordLength"`
	ForcePasswordReset       bool `json:"forcePasswordReset"`
	AuditLogRetentionDays    int  `json:"auditLogRetentionDays"`
}

func (c *UserController) GetSystemSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var settings SystemSettingsPayload
	err := c.db.QueryRow(`
		SELECT inactivity_timeout_minutes, min_password_length, force_password_reset, audit_log_retention_days
		FROM dbo.system_settings
		WHERE id = 1
	`).Scan(&settings.InactivityTimeoutMinutes, &settings.MinPasswordLength, &settings.ForcePasswordReset, &settings.AuditLogRetentionDays)
	if err == sql.ErrNoRows {
		settings = SystemSettingsPayload{
			InactivityTimeoutMinutes: 15,
			MinPasswordLength:        8,
			ForcePasswordReset:       true,
			AuditLogRetentionDays:    90,
		}
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(settings)
}

func (c *UserController) UpdateSystemSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload SystemSettingsPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	if payload.InactivityTimeoutMinutes < 1 || payload.InactivityTimeoutMinutes > 1440 {
		http.Error(w, "Inactivity timeout must be between 1 and 1440 minutes", http.StatusBadRequest)
		return
	}
	if payload.MinPasswordLength < 4 || payload.MinPasswordLength > 128 {
		http.Error(w, "Minimum password length must be between 4 and 128 characters", http.StatusBadRequest)
		return
	}
	if payload.AuditLogRetentionDays < 1 || payload.AuditLogRetentionDays > 3650 {
		http.Error(w, "Audit log retention days must be between 1 and 3650 days", http.StatusBadRequest)
		return
	}

	_, err := c.db.Exec(`
		UPDATE dbo.system_settings
		SET inactivity_timeout_minutes = @p1,
		    min_password_length = @p2,
		    force_password_reset = @p3,
		    audit_log_retention_days = @p4,
		    updated_date = @p5
		WHERE id = 1
	`, payload.InactivityTimeoutMinutes, payload.MinPasswordLength, payload.ForcePasswordReset, payload.AuditLogRetentionDays, time.Now().UTC())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"message": "System settings updated successfully"})
}

func (c *UserController) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var payload struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	email := strings.TrimSpace(payload.Email)
	if email == "" {
		http.Error(w, "email is required", http.StatusBadRequest)
		return
	}

	// Verify email exists in active accounts
	var userExists int
	err := c.db.QueryRow(`SELECT COUNT(1) FROM dbo.users WHERE email = @p1 AND is_deleted = 0 AND is_active = 1`, email).Scan(&userExists)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if userExists == 0 {
		http.Error(w, "no active user found with this email", http.StatusNotFound)
		return
	}

	// Generate a 6-digit code using time nano mod 1000000
	code := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)

	// Save code in dbo.password_reset_codes
	expiresAt := time.Now().UTC().Add(15 * time.Minute)
	_, err = c.db.Exec(`
		INSERT INTO dbo.password_reset_codes (email, code, expires_at, used)
		VALUES (@p1, @p2, @p3, 0)
	`, email, code, expiresAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Send code email
	if c.mailer != nil {
		subject := "Xentral ACMS - Password Reset Verification Code"
		body := fmt.Sprintf("Hello,\n\n"+
			"You requested a password reset for your Xentral ACMS account.\n\n"+
			"Your 6-digit verification code is: %s\n\n"+
			"This code will expire in 15 minutes.\n\n"+
			"If you did not request this, please ignore this email.\n\n"+
			"Regards,\n"+
			"Xentral ACMS System\n", code)
		_ = c.mailer.SendMail([]string{email}, subject, body)
	}

	json.NewEncoder(w).Encode(map[string]string{"message": "Verification code sent successfully"})
}

func (c *UserController) ResetPasswordVerify(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var payload struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	email := strings.TrimSpace(payload.Email)
	code := strings.TrimSpace(payload.Code)
	newPassword := strings.TrimSpace(payload.NewPassword)

	if email == "" || code == "" || newPassword == "" {
		http.Error(w, "email, code, and newPassword are required", http.StatusBadRequest)
		return
	}

	// Verify code is valid and not expired
	var codeID int
	err := c.db.QueryRow(`
		SELECT TOP 1 id
		FROM dbo.password_reset_codes
		WHERE email = @p1 AND code = @p2 AND used = 0 AND expires_at > @p3
		ORDER BY expires_at DESC
	`, email, code, time.Now().UTC()).Scan(&codeID)

	if err == sql.ErrNoRows {
		http.Error(w, "invalid or expired verification code", http.StatusUnauthorized)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Mark code as used
	_, err = c.db.Exec(`UPDATE dbo.password_reset_codes SET used = 1 WHERE id = @p1`, codeID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Update user password
	_, err = c.db.Exec(`
		UPDATE dbo.users
		SET login_password = @p2, updated_date = @p3, must_change_password = 0
		WHERE email = @p1 AND is_deleted = 0
	`, email, newPassword, time.Now().UTC())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Log audit event
	var username string
	_ = c.db.QueryRow(`SELECT user_id FROM dbo.users WHERE email = @p1 AND is_deleted = 0`, email).Scan(&username)
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		username,
		"GUEST",
		"Self Password Reset",
		"User",
		username,
		"",
		r.RemoteAddr,
		"Success",
		"Medium",
		"User "+username+" successfully reset their password via email verification code",
	)

	json.NewEncoder(w).Encode(map[string]string{"message": "Password updated successfully"})
}

func (c *UserController) ChangePassword(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	currentPassword := strings.TrimSpace(payload.CurrentPassword)
	newPassword := strings.TrimSpace(payload.NewPassword)

	if currentPassword == "" || newPassword == "" {
		http.Error(w, "currentPassword and newPassword are required", http.StatusBadRequest)
		return
	}

	// Verify current password
	var dbPassword, username string
	err := c.db.QueryRow(`
		SELECT login_password, user_id
		FROM dbo.users
		WHERE id = @p1 AND is_deleted = 0 AND is_active = 1
	`, id).Scan(&dbPassword, &username)

	if err == sql.ErrNoRows {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if dbPassword != currentPassword {
		http.Error(w, "incorrect current password", http.StatusUnauthorized)
		return
	}

	// Check password policy (minimum length)
	var minLen int
	_ = c.db.QueryRow(`SELECT min_password_length FROM dbo.system_settings WHERE id = 1`).Scan(&minLen)
	if minLen < 4 {
		minLen = 8
	}
	if len(newPassword) < minLen {
		http.Error(w, fmt.Sprintf("password must be at least %d characters long", minLen), http.StatusBadRequest)
		return
	}

	// Update password and clear must_change_password
	_, err = c.db.Exec(`
		UPDATE dbo.users
		SET login_password = @p2, updated_date = @p3, must_change_password = 0
		WHERE id = @p1 AND is_deleted = 0
	`, id, newPassword, time.Now().UTC())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Log audit event
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		username,
		"USER",
		"Change Password",
		"User",
		username,
		"",
		r.RemoteAddr,
		"Success",
		"Info",
		"User "+username+" successfully updated their personal password in Settings",
	)

	json.NewEncoder(w).Encode(map[string]string{"message": "Password changed successfully"})
}

func (c *UserController) GetPendingCounts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var pendingTickets, pendingRequests int

	err := c.db.QueryRow(`
		SELECT COUNT(1) 
		FROM dbo.Ticket 
		WHERE status = 'Pending' AND isdeleted = 0
	`).Scan(&pendingTickets)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	err = c.db.QueryRow(`
		SELECT COUNT(1) 
		FROM dbo.account_requests 
		WHERE status = 'PENDING'
	`).Scan(&pendingRequests)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]int{
		"pendingTickets":  pendingTickets,
		"pendingRequests": pendingRequests,
	})
}

func (c *UserController) RecoverAccount(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var payload struct {
		FirstName   string `json:"firstName"`
		LastName    string `json:"lastName"`
		Email       string `json:"email"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	payload.FirstName = strings.TrimSpace(payload.FirstName)
	payload.LastName = strings.TrimSpace(payload.LastName)
	payload.Email = strings.TrimSpace(payload.Email)

	if payload.FirstName == "" || payload.LastName == "" || payload.Email == "" {
		http.Error(w, "First name, last name, and email are required", http.StatusBadRequest)
		return
	}

	// Find the user matching First Name, Last Name, and Email
	var id, userID string
	var isActive, isDeleted bool
	err := c.db.QueryRow(`
		SELECT CONVERT(VARCHAR(36), id) as id, user_id, is_active, is_deleted
		FROM dbo.users
		WHERE first_name = @p1 AND last_name = @p2 AND email = @p3 AND is_deleted = 0
	`, payload.FirstName, payload.LastName, payload.Email).Scan(&id, &userID, &isActive, &isDeleted)

	if err == sql.ErrNoRows {
		http.Error(w, "No active account matches the details provided", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if !isActive {
		http.Error(w, "Matched account is currently disabled", http.StatusForbidden)
		return
	}

	passwordReset := false
	if payload.NewPassword != "" {
		// Check password policy (minimum length)
		var minLen int
		_ = c.db.QueryRow(`SELECT min_password_length FROM dbo.system_settings WHERE id = 1`).Scan(&minLen)
		if minLen < 4 {
			minLen = 8
		}
		if len(payload.NewPassword) < minLen {
			http.Error(w, fmt.Sprintf("new password must be at least %d characters long", minLen), http.StatusBadRequest)
			return
		}

		// Update password in DB directly
		_, err = c.db.Exec(`
			UPDATE dbo.users
			SET login_password = @p2, updated_date = @p3, must_change_password = 0
			WHERE id = @p1 AND is_deleted = 0
		`, id, payload.NewPassword, time.Now().UTC())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		passwordReset = true
	}

	// Log audit event
	auditLogger := NewAuditLogController(c.db)
	details := fmt.Sprintf("Account recovered for username: %s. Password Reset: %v", userID, passwordReset)
	_ = auditLogger.LogEvent(
		userID,
		"USER",
		"Account Recovery",
		"User",
		userID,
		"",
		r.RemoteAddr,
		"Success",
		"Medium",
		details,
	)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"userId":        userID,
		"passwordReset": passwordReset,
	})
}





