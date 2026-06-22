package controller

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

type FileController struct {
	db *sql.DB
}

func NewFileController(db *sql.DB) *FileController {
	// Create shared_uploads directory if not exists
	if err := os.MkdirAll("shared_uploads", os.ModePerm); err != nil {
		log.Printf("[FILE ERROR] Failed to create shared_uploads folder: %v", err)
	}
	return &FileController{db: db}
}

type SharedFile struct {
	ID         string    `json:"id"`
	Filename   string    `json:"filename"`
	UploadedBy string    `json:"uploadedBy"`
	UploadedAt time.Time `json:"uploadedAt"`
	FileSize   int64     `json:"fileSize"`
}

func (c *FileController) UploadFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Limit to 50MB
	r.Body = http.MaxBytesReader(w, r.Body, 50<<20)
	if err := r.ParseMultipartForm(50 << 20); err != nil {
		http.Error(w, "File size exceeds 50MB limit", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Error retrieving file from request form-data", http.StatusBadRequest)
		return
	}
	defer file.Close()

	uploadedBy := r.FormValue("uploadedBy")
	if uploadedBy == "" {
		uploadedBy = "UNKNOWN"
	}

	fileID := uuid.New().String()
	safeFilename := filepath.Base(handler.Filename)
	uniqueFilename := fmt.Sprintf("%s_%s", fileID[:8], safeFilename)
	uploadPath := filepath.Join("shared_uploads", uniqueFilename)

	// Save to disk
	dst, err := os.OpenFile(uploadPath, os.O_WRONLY|os.O_CREATE, 0666)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	fileSize, err := io.Copy(dst, file)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Insert into dbo.shared_files
	_, err = c.db.Exec(`
		INSERT INTO dbo.shared_files (id, filename, filepath, uploaded_by, uploaded_at, file_size)
		VALUES (@p1, @p2, @p3, @p4, GETUTCDATE(), @p5)
	`, fileID, safeFilename, uploadPath, uploadedBy, fileSize)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		uploadedBy,
		"USER",
		"File Uploaded",
		"File",
		safeFilename,
		"",
		r.RemoteAddr,
		"Success",
		"High",
		fmt.Sprintf("User %s uploaded file %s (Size: %.2f MB) to Shared File Box", uploadedBy, safeFilename, float64(fileSize)/(1024*1024)),
	)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"id":       fileID,
		"filename": safeFilename,
		"size":     fileSize,
	})
}

func (c *FileController) ListFiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	rows, err := c.db.Query(`
		SELECT id, filename, uploaded_by, uploaded_at, file_size
		FROM dbo.shared_files
		ORDER BY uploaded_at DESC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	files := make([]SharedFile, 0)
	for rows.Next() {
		var f SharedFile
		if err := rows.Scan(&f.ID, &f.Filename, &f.UploadedBy, &f.UploadedAt, &f.FileSize); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		files = append(files, f)
	}

	json.NewEncoder(w).Encode(files)
}

func (c *FileController) DownloadFile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "File ID is required", http.StatusBadRequest)
		return
	}

	downloadedBy := r.URL.Query().Get("userId")
	if downloadedBy == "" {
		downloadedBy = "UNKNOWN"
	}

	var filename, filepathStr string
	err := c.db.QueryRow(`
		SELECT filename, filepath
		FROM dbo.shared_files
		WHERE id = @p1
	`, id).Scan(&filename, &filepathStr)
	if err == sql.ErrNoRows {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Stream file to browser
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	http.ServeFile(w, r, filepathStr)

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		downloadedBy,
		"USER",
		"File Downloaded",
		"File",
		filename,
		"",
		r.RemoteAddr,
		"Success",
		"High",
		fmt.Sprintf("User %s downloaded file %s from Shared File Box", downloadedBy, filename),
	)
}

func (c *FileController) DeleteFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "File ID is required", http.StatusBadRequest)
		return
	}

	deletedBy := r.URL.Query().Get("userId")
	if deletedBy == "" {
		deletedBy = "UNKNOWN"
	}

	var filename, filepathStr string
	err := c.db.QueryRow(`
		SELECT filename, filepath
		FROM dbo.shared_files
		WHERE id = @p1
	`, id).Scan(&filename, &filepathStr)
	if err == sql.ErrNoRows {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Delete from disk
	_ = os.Remove(filepathStr)

	// Delete from DB
	_, err = c.db.Exec(`DELETE FROM dbo.shared_files WHERE id = @p1`, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Audit Log
	auditLogger := NewAuditLogController(c.db)
	_ = auditLogger.LogEvent(
		deletedBy,
		"USER",
		"File Deleted",
		"File",
		filename,
		"",
		r.RemoteAddr,
		"Success",
		"High",
		fmt.Sprintf("User %s deleted file %s from Shared File Box", deletedBy, filename),
	)

	json.NewEncoder(w).Encode(map[string]string{"message": "File deleted successfully"})
}
