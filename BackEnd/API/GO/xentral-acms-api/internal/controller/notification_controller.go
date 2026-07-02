package controller

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"xentral-acms-api/internal/dbproxy"
)

// Hub and SSE handlers replaced with SignalR Server broadcasts

type NotificationController struct {
	db dbproxy.DB
}

func NewNotificationController(db dbproxy.DB) *NotificationController {
	return &NotificationController{db: db}
}

// AddNotification Helper function to create notification and broadcast
func AddNotification(db dbproxy.DB, userID, title, message, link string) error {
	id := uuid.New().String()
	_, err := db.Exec(`
		INSERT INTO dbo.notifications (id, user_id, title, message, link, is_read, created_at)
		VALUES (@p1, @p2, @p3, @p4, @p5, 0, GETUTCDATE())
	`, id, userID, title, message, link)
	if err != nil {
		log.Printf("[NOTIFICATION ERROR] Failed to insert notification: %v", err)
		return err
	}

	// Broadcast event via SignalR Hub
	eventPayload := map[string]string{
		"type":    "new_notification",
		"userId":  userID,
		"title":   title,
		"message": message,
	}
	payloadBytes, _ := json.Marshal(eventPayload)
	if GlobalSignalRServer != nil {
		GlobalSignalRServer.HubClients().All().Send("OnEventUpdate", string(payloadBytes))
	}
	return nil
}

// BroadcastPendingCountsUpdate Helper to trigger frontend badge updates
func BroadcastPendingCountsUpdate() {
	eventPayload := map[string]string{
		"type": "pending_counts_update",
	}
	payloadBytes, _ := json.Marshal(eventPayload)
	if GlobalSignalRServer != nil {
		GlobalSignalRServer.HubClients().All().Send("OnEventUpdate", string(payloadBytes))
	}
}

func (c *NotificationController) ListNotifications(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	// Fetch notifications for the specific user OR group notifications for Admins (if user is ADMIN/SUPER_ADMIN)
	var userRole string
	_ = c.db.QueryRow(`
		SELECT r.role_name 
		FROM dbo.users u
		JOIN dbo.user_role r ON r.id = u.user_role_id
		WHERE u.id = @p1
	`, userID).Scan(&userRole)

	query := `
		SELECT id, user_id, title, message, ISNULL(link, '') as link, is_read, created_at
		FROM dbo.notifications
		WHERE user_id = @p1
	`
	// If Admin, also retrieve group notifications marked as ROLE_ADMIN
	var rows *sql.Rows
	var err error
	if userRole == "ADMIN" || userRole == "SUPER_ADMIN" {
		query += " OR user_id = 'ROLE_ADMIN' ORDER BY created_at DESC"
		rows, err = c.db.Query(query, userID)
	} else {
		query += " ORDER BY created_at DESC"
		rows, err = c.db.Query(query, userID)
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type NotificationRecord struct {
		ID        string    `json:"id"`
		UserID    string    `json:"userId"`
		Title     string    `json:"title"`
		Message   string    `json:"message"`
		Link      string    `json:"link"`
		IsRead    bool      `json:"isRead"`
		CreatedAt time.Time `json:"createdAt"`
	}

	records := make([]NotificationRecord, 0)
	for rows.Next() {
		var rec NotificationRecord
		err := rows.Scan(&rec.ID, &rec.UserID, &rec.Title, &rec.Message, &rec.Link, &rec.IsRead, &rec.CreatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		records = append(records, rec)
	}

	json.NewEncoder(w).Encode(records)
}

func (c *NotificationController) MarkAsRead(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "id is required", http.StatusBadRequest)
		return
	}

	_, err := c.db.Exec(`
		UPDATE dbo.notifications
		SET is_read = 1
		WHERE id = @p1
	`, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"message": "Notification marked as read"})
}

func (c *NotificationController) ClearAll(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		http.Error(w, "userId is required", http.StatusBadRequest)
		return
	}

	_, err := c.db.Exec(`
		DELETE FROM dbo.notifications
		WHERE user_id = @p1 OR (user_id = 'ROLE_ADMIN' AND EXISTS (
			SELECT 1 FROM dbo.users u 
			JOIN dbo.user_role r ON r.id = u.user_role_id 
			WHERE u.id = @p1 AND r.role_name IN ('ADMIN', 'SUPER_ADMIN')
		))
	`, userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{"message": "Notifications cleared successfully"})
}
