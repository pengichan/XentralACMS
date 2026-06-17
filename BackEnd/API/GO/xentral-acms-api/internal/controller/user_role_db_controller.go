package controller

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"xentral-acms-api/internal/dto"
)

type UserRoleControllerDB struct {
	db *sql.DB
}

func NewUserRoleControllerDB(db *sql.DB) *UserRoleControllerDB {
	return &UserRoleControllerDB{db: db}
}

func (c *UserRoleControllerDB) List(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	rows, err := c.db.Query(`
		SELECT CONVERT(VARCHAR(36), id) AS id, role_name, description, is_deleted, created_date, updated_date,
		       CONVERT(VARCHAR(36), created_by) AS created_by, CONVERT(VARCHAR(36), updated_by) AS updated_by
		FROM dbo.user_role
		WHERE is_deleted = 0
		ORDER BY role_name
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]dto.UserRoleDTO, 0)
	for rows.Next() {
		r, err := scanRole(rows)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		result = append(result, r)
	}
	json.NewEncoder(w).Encode(result)
}

func (c *UserRoleControllerDB) GetByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	row := c.db.QueryRow(`
		SELECT CONVERT(VARCHAR(36), id) AS id, role_name, description, is_deleted, created_date, updated_date,
		       CONVERT(VARCHAR(36), created_by) AS created_by, CONVERT(VARCHAR(36), updated_by) AS updated_by
		FROM dbo.user_role
		WHERE id = @p1 AND is_deleted = 0
	`, id)

	role, err := scanRole(row)
	if err == sql.ErrNoRows {
		http.Error(w, "role not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(role)
}

type roleScanner interface {
	Scan(dest ...any) error
}

func scanRole(s roleScanner) (dto.UserRoleDTO, error) {
	var r dto.UserRoleDTO
	var desc, createdBy, updatedBy sql.NullString
	var createdDate, updatedDate sql.NullTime
	err := s.Scan(&r.ID, &r.RoleName, &desc, &r.IsDeleted, &createdDate, &updatedDate, &createdBy, &updatedBy)
	if err != nil {
		return dto.UserRoleDTO{}, err
	}
	if desc.Valid {
		r.Description = desc.String
	}
	if createdDate.Valid {
		t := createdDate.Time
		r.CreatedDate = &t
	}
	if updatedDate.Valid {
		t := updatedDate.Time
		r.UpdatedDate = &t
	}
	if createdBy.Valid {
		r.CreatedBy = createdBy.String
	}
	if updatedBy.Valid {
		r.UpdatedBy = updatedBy.String
	}
	return r, nil
}

// Create / Update / Delete kept minimal for prototype
func (c *UserRoleControllerDB) Create(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	var payload dto.UserRoleDTO
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	now := time.Now().UTC()
	row := c.db.QueryRow(`SELECT CONVERT(VARCHAR(36), NEWID())`)
	if err := row.Scan(&payload.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_, err := c.db.Exec(`
		INSERT INTO dbo.user_role (id, role_name, description, is_deleted, created_date, updated_date)
		VALUES (@p1, @p2, @p3, 0, @p4, @p4)
	`, payload.ID, payload.RoleName, nullIfEmpty(payload.Description), now)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(payload)
}

func (c *UserRoleControllerDB) Update(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")
	var payload dto.UserRoleDTO
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}
	now := time.Now().UTC()
	_, err := c.db.Exec(`
		UPDATE dbo.user_role SET role_name = @p2, description = @p3, updated_date = @p4 WHERE id = @p1
	`, id, payload.RoleName, nullIfEmpty(payload.Description), now)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	payload.ID = id
	json.NewEncoder(w).Encode(payload)
}

func (c *UserRoleControllerDB) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	_, err := c.db.Exec(`UPDATE dbo.user_role SET is_deleted = 1 WHERE id = @p1`, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

