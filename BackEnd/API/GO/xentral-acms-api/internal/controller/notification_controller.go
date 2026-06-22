package controller

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
)

type SSEHub struct {
	clients    map[chan string]bool
	register   chan chan string
	unregister chan chan string
	broadcast  chan string
	mu         sync.RWMutex
}

var GlobalSSEHub *SSEHub

func InitSSEHub() {
	GlobalSSEHub = &SSEHub{
		clients:    make(map[chan string]bool),
		register:   make(chan chan string),
		unregister: make(chan chan string),
		broadcast:  make(chan string),
	}
	go GlobalSSEHub.run()
}

func (h *SSEHub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client)
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client <- message:
				default:
					// Avoid blocking if a client channel buffer is full
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *SSEHub) Broadcast(message string) {
	if h != nil && h.broadcast != nil {
		h.broadcast <- message
	}
}

type NotificationController struct {
	db *sql.DB
}

func NewNotificationController(db *sql.DB) *NotificationController {
	if GlobalSSEHub == nil {
		InitSSEHub()
	}
	return &NotificationController{db: db}
}

// AddNotification Helper function to create notification and broadcast
func AddNotification(db *sql.DB, userID, title, message, link string) error {
	id := uuid.New().String()
	_, err := db.Exec(`
		INSERT INTO dbo.notifications (id, user_id, title, message, link, is_read, created_at)
		VALUES (@p1, @p2, @p3, @p4, @p5, 0, GETUTCDATE())
	`, id, userID, title, message, link)
	if err != nil {
		log.Printf("[NOTIFICATION ERROR] Failed to insert notification: %v", err)
		return err
	}

	// Broadcast event via SSE
	eventPayload := map[string]string{
		"type":    "new_notification",
		"userId":  userID,
		"title":   title,
		"message": message,
	}
	payloadBytes, _ := json.Marshal(eventPayload)
	if GlobalSSEHub != nil {
		GlobalSSEHub.Broadcast(string(payloadBytes))
	}
	return nil
}

// BroadcastPendingCountsUpdate Helper to trigger frontend badge updates
func BroadcastPendingCountsUpdate() {
	eventPayload := map[string]string{
		"type": "pending_counts_update",
	}
	payloadBytes, _ := json.Marshal(eventPayload)
	if GlobalSSEHub != nil {
		GlobalSSEHub.Broadcast(string(payloadBytes))
	}
}

func (c *NotificationController) SSEHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	clientChan := make(chan string, 10)
	GlobalSSEHub.register <- clientChan

	defer func() {
		GlobalSSEHub.unregister <- clientChan
	}()

	// Periodically send keep-alive ping comment lines
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	notify := r.Context().Done()

	for {
		select {
		case msg, ok := <-clientChan:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case <-notify:
			return
		}
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
