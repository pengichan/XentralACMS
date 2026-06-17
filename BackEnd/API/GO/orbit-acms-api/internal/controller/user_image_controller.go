package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"orbit-acms-api/internal/dto"
)

type UserImageController struct {
	mu    sync.RWMutex
	items map[string]dto.UserImageDTO
}

func NewUserImageController() *UserImageController {
	now := time.Now().UTC()
	sample := dto.UserImageDTO{
		ID:              "UIMG-001",
		UserID:          "USR-001",
		ImageTypeID:     "ITP-001",
		ImageName:       "profile.jpg",
		StoredDirectory: "/uploads/user/USR-001",
		IsDeleted:       false,
		UploadedDate:    now,
	}

	return &UserImageController{
		items: map[string]dto.UserImageDTO{
			sample.ID: sample,
		},
	}
}

func (c *UserImageController) List(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	c.mu.RLock()
	defer c.mu.RUnlock()

	response := make([]dto.UserImageDTO, 0, len(c.items))
	for _, item := range c.items {
		response = append(response, item)
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserImageController) GetByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	c.mu.RLock()
	item, ok := c.items[id]
	c.mu.RUnlock()
	if !ok {
		http.Error(w, "user image not found", http.StatusNotFound)
		return
	}

	if err := json.NewEncoder(w).Encode(item); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserImageController) Create(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload dto.UserImageDTO
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	if payload.ID == "" {
		payload.ID = fmt.Sprintf("UIMG-%d", now.UnixNano())
	}
	if payload.UploadedDate.IsZero() {
		payload.UploadedDate = now
	}

	c.mu.Lock()
	c.items[payload.ID] = payload
	c.mu.Unlock()

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserImageController) Update(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload dto.UserImageDTO
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	existing, ok := c.items[id]
	if !ok {
		http.Error(w, "user image not found", http.StatusNotFound)
		return
	}

	payload.ID = id
	if payload.UploadedDate.IsZero() {
		payload.UploadedDate = existing.UploadedDate
	}
	c.items[id] = payload

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *UserImageController) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	c.mu.Lock()
	defer c.mu.Unlock()

	if _, ok := c.items[id]; !ok {
		http.Error(w, "user image not found", http.StatusNotFound)
		return
	}

	delete(c.items, id)
	w.WriteHeader(http.StatusNoContent)
}

