package controller

import (
	"database/sql"
	"encoding/base64"
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

func (c *FileController) ServeRDPFileBox(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XentralACMS - RDP File Exchange Portal</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #0b0f19;
            --card-bg: rgba(15, 22, 42, 0.9);
            --card-border: rgba(255, 255, 255, 0.08);
            --primary: #4facfe;
            --primary-glow: rgba(79, 172, 254, 0.3);
            --success: #10b981;
            --success-glow: rgba(16, 185, 129, 0.2);
            --text: #f1f5f9;
            --text-muted: #94a3b8;
        }

        body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', sans-serif;
            background-color: var(--bg-color);
            color: var(--text);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-image: radial-gradient(circle at 10% 20%, rgba(79, 172, 254, 0.05) 0%, transparent 50%),
                              radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.04) 0%, transparent 50%);
        }

        .container {
            width: 90%;
            max-width: 750px;
            background: var(--card-bg);
            backdrop-filter: blur(20px);
            border: 1px solid var(--card-border);
            border-radius: 16px;
            padding: 2.5rem;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            margin: 2rem 0;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            padding-bottom: 1.5rem;
        }

        .header h1 {
            margin: 0;
            font-size: 1.5rem;
            font-weight: 800;
            letter-spacing: -0.5px;
            color: #fff;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .header h1 span {
            background: linear-gradient(90deg, #4facfe, #00f2fe);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .status-badge {
            font-size: 0.72rem;
            padding: 6px 12px;
            border-radius: 99px;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid rgba(16, 185, 129, 0.2);
            color: var(--success);
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .status-pulse {
            width: 6px;
            height: 6px;
            background-color: var(--success);
            border-radius: 50%;
            animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }

        .dropzone {
            border: 2px dashed rgba(255, 255, 255, 0.12);
            border-radius: 12px;
            padding: 2.5rem 1.5rem;
            text-align: center;
            background: rgba(0, 0, 0, 0.2);
            cursor: pointer;
            transition: all 0.25s ease;
            position: relative;
            margin-bottom: 2rem;
        }

        .dropzone:hover, .dropzone.dragover {
            border-color: var(--primary);
            background: rgba(79, 172, 254, 0.04);
            box-shadow: 0 0 20px var(--primary-glow);
        }

        .dropzone input {
            position: absolute;
            inset: 0;
            opacity: 0;
            cursor: pointer;
            width: 100%;
            height: 100%;
        }

        .dropzone-icon {
            font-size: 2.2rem;
            margin-bottom: 0.6rem;
            display: block;
        }

        .dropzone-text {
            font-size: 0.9rem;
            font-weight: 600;
            color: #f8fafc;
        }

        .dropzone-subtext {
            font-size: 0.75rem;
            color: var(--text-muted);
            margin-top: 0.3rem;
        }

        .progress-container {
            display: none;
            margin-top: 1.2rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 99px;
            height: 6px;
            overflow: hidden;
        }

        .progress-bar {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, var(--primary), var(--success));
            border-radius: 99px;
            transition: width 0.1s ease;
        }

        .section-title {
            font-size: 0.8rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--primary);
            margin-bottom: 0.8rem;
        }

        .file-list {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .file-item {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            padding: 0.8rem 1.2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.2s ease;
        }

        .file-item:hover {
            border-color: rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.04);
            transform: translateY(-1px);
        }

        .file-info {
            display: flex;
            flex-direction: column;
            gap: 0.2rem;
            min-width: 0;
            flex: 1;
            margin-right: 1.5rem;
        }

        .file-name {
            font-size: 0.85rem;
            font-weight: 600;
            color: #fff;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .file-meta {
            font-size: 0.7rem;
            color: var(--text-muted);
        }

        .file-meta strong {
            color: #ffcb42;
        }

        .actions {
            display: flex;
            gap: 0.5rem;
        }

        .btn {
            padding: 0.4rem 0.8rem;
            border-radius: 6px;
            font-size: 0.78rem;
            font-weight: 700;
            cursor: pointer;
            border: none;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .btn-download {
            background: var(--primary);
            color: #000;
            box-shadow: 0 2px 8px rgba(79, 172, 254, 0.2);
        }

        .btn-download:hover {
            background: #60baff;
            box-shadow: 0 4px 12px rgba(79, 172, 254, 0.4);
            transform: translateY(-1px);
        }

        .btn-delete {
            background: rgba(239, 68, 68, 0.1);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .btn-delete:hover {
            background: rgba(239, 68, 68, 0.25);
            transform: translateY(-1px);
        }

        .no-files {
            text-align: center;
            padding: 2.5rem 1rem;
            color: var(--text-muted);
            font-size: 0.82rem;
            border: 1px dashed rgba(255, 255, 255, 0.06);
            border-radius: 10px;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .fade-in {
            animation: fadeIn 0.25s ease-out forwards;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📂 RDP File <span>Exchange Portal</span></h1>
            <div class="status-badge">
                <span class="status-pulse"></span>
                VM Tunnel Connected
            </div>
        </div>

        <!-- Upload section -->
        <div class="dropzone" id="dropzone">
            <input type="file" id="fileInput">
            <span class="dropzone-icon">📤</span>
            <div class="dropzone-text">Drag & drop files here, or click to browse</div>
            <div class="dropzone-subtext">Maximum upload size: 50MB. Files are sent instantly.</div>
            <div class="progress-container" id="progressContainer">
                <div class="progress-bar" id="progressBar"></div>
            </div>
        </div>

        <!-- File list -->
        <div class="section-title">Shared File Repository</div>
        <div class="file-list" id="fileList">
            <div class="no-files">Loading shared files repository...</div>
        </div>
    </div>

    <script>
        const API = window.location.origin;
        const fileInput = document.getElementById('fileInput');
        const dropzone = document.getElementById('dropzone');
        const fileList = document.getElementById('fileList');
        const progressContainer = document.getElementById('progressContainer');
        const progressBar = document.getElementById('progressBar');

        // Drag events
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, e => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, e => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
            }, false);
        });

        dropzone.addEventListener('drop', e => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                uploadFile(files[0]);
            }
        });

        fileInput.addEventListener('change', e => {
            if (fileInput.files.length > 0) {
                uploadFile(fileInput.files[0]);
            }
        });

        async function fetchFiles() {
            try {
                const res = await fetch(API + '/api/files');
                if (res.ok) {
                    const data = await res.json();
                    renderFiles(data);
                }
            } catch (err) {
                console.error("Error loading files", err);
                fileList.innerHTML = '<div class="no-files">\u26a0\ufe0f Connection error: Failed to fetch files.</div>';
            }
        }

        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        function renderFiles(filesArray) {
            if (filesArray.length === 0) {
                fileList.innerHTML = '<div class="no-files">No files uploaded. Drag a file here to upload it.</div>';
                return;
            }

            fileList.innerHTML = '';
            filesArray.forEach((f, idx) => {
                const item = document.createElement('div');
                item.className = 'file-item fade-in';
                item.style.animationDelay = (idx * 0.03) + 's';
                
                const dateStr = new Date(f.uploadedAt).toLocaleString();
                const sizeStr = formatBytes(f.fileSize);

                item.innerHTML = '<div class="file-info">' +
                    '<span class="file-name">📄 ' + f.filename + '</span>' +
                    '<span class="file-meta">Size: ' + sizeStr + ' | Uploaded by: <strong>' + f.uploadedBy + '</strong> | ' + dateStr + '</span>' +
                    '</div>' +
                    '<div class="actions">' +
                    '<button class="btn btn-download" onclick="downloadFile(\'' + f.id + '\', \'' + f.filename.replace(/'/g, "\\'") + '\')">⬇ Download</button>' +
                    '<button class="btn btn-delete" onclick="deleteFile(\'' + f.id + '\')">✕ Delete</button>' +
                    '</div>';
                fileList.appendChild(item);
            });
        }

        function downloadFile(id, filename) {
            const url = API + '/api/files/download/' + id + '?userId=RDP_PORTAL_USER';
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        async function deleteFile(id) {
            if (!confirm('Are you sure you want to delete this file?')) return;
            try {
                const res = await fetch(API + '/api/files/' + id + '?userId=RDP_PORTAL_USER', {
                    method: 'DELETE'
                });
                if (res.ok) {
                    fetchFiles();
                } else {
                    alert('Failed to delete file');
                }
            } catch (err) {
                console.error("Delete error", err);
            }
        }

        function uploadFile(file) {
            progressContainer.style.display = 'block';
            progressBar.style.width = '0%';

            const formData = new FormData();
            formData.append('file', file);
            formData.append('uploadedBy', 'RDP_USER');

            const xhr = new XMLHttpRequest();
            xhr.open('POST', API + '/api/files/upload', true);

            xhr.upload.onprogress = e => {
                if (e.lengthComputable) {
                    const percentage = (e.loaded / e.total) * 100;
                    progressBar.style.width = percentage + '%';
                }
            };

            xhr.onload = () => {
                progressContainer.style.display = 'none';
                if (xhr.status === 200) {
                    fileInput.value = '';
                    fetchFiles();
                } else {
                    alert('Upload failed: ' + xhr.responseText);
                }
            };

            xhr.onerror = () => {
                progressContainer.style.display = 'none';
                alert('Connection error during upload.');
            };

            xhr.send(formData);
        }

        // Init
        fetchFiles();
    </script>
</body>
</html>`))
}

func (c *FileController) GetFileBase64(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, `{"error":"File ID is required"}`, http.StatusBadRequest)
		return
	}

	var filename, filepathStr string
	err := c.db.QueryRow(`
		SELECT filename, filepath
		FROM dbo.shared_files
		WHERE id = @p1
	`, id).Scan(&filename, &filepathStr)
	if err == sql.ErrNoRows {
		http.Error(w, `{"error":"File not found"}`, http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	data, err := os.ReadFile(filepathStr)
	if err != nil {
		http.Error(w, `{"error":"Failed to read file on disk"}`, http.StatusInternalServerError)
		return
	}

	encoded := base64.StdEncoding.EncodeToString(data)

	json.NewEncoder(w).Encode(map[string]string{
		"filename": filename,
		"content":  encoded,
	})
}

