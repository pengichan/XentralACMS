package controller

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"orbit-acms-api/internal/dto"
)

type UserController struct {
	db *sql.DB
}

const defaultSignUpRoleID = "22222222-2222-2222-2222-222222222222"

func NewUserController(db *sql.DB) *UserController {
	return &UserController{
		db: db,
	}
}

func (c *UserController) List(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	rows, err := c.db.Query(`
		SELECT
			CONVERT(VARCHAR(36), id) as id, CONVERT(VARCHAR(36), user_role_id) as user_role_id, user_id, first_name, last_name, email, mobile_no, login_password,
			remark, last_login, is_active, is_deleted, created_date, updated_date, CONVERT(VARCHAR(36), created_by) as created_by, CONVERT(VARCHAR(36), updated_by) as updated_by
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
			remark, last_login, is_active, is_deleted, created_date, updated_date, created_by, updated_by
		) VALUES (
			@p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9, @p10, @p11, @p12, @p13, @p14, @p15, @p16
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
		    first_name = @p4,
		    last_name = @p5,
		    email = @p6,
		    mobile_no = @p7,
		    login_password = @p8,
		    remark = @p9,
		    last_login = @p10,
		    is_active = @p11,
		    updated_date = @p12,
		    updated_by = @p13
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

	result, err := c.db.Exec(`
		UPDATE dbo.users
		SET is_deleted = 1, updated_date = @p2
		WHERE id = @p1 AND is_deleted = 0
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
			"User "+username+" was deleted successfully",
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
			remark, last_login, is_active, is_deleted, created_date, updated_date, CONVERT(VARCHAR(36), created_by) as created_by, CONVERT(VARCHAR(36), updated_by) as updated_by
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
			remark, last_login, is_active, is_deleted, created_date, updated_date, CONVERT(VARCHAR(36), created_by) as created_by, CONVERT(VARCHAR(36), updated_by) as updated_by
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
	)
	if err != nil {
		return dto.UserDTO{}, err
	}

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
		err := c.db.QueryRow(`SELECT COUNT(1) FROM dbo.users WHERE email = @p1`, userID).Scan(&count)
		if err != nil {
			return false, err
		}
		return count > 0, nil
	}

	var count int
	err := c.db.QueryRow(`SELECT COUNT(1) FROM dbo.users WHERE email = @p1 AND id <> @p2`, userID, excludeID).Scan(&count)
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
