package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"orbit-acms-api/internal/dto"
)

type ImageTypeController struct {
	mu    sync.RWMutex
	items map[string]dto.ImageTypeDTO
}

func NewImageTypeController() *ImageTypeController {
	now := time.Now().UTC()
	sample := dto.ImageTypeDTO{
		ID:            "ITP-001",
		ImageTypeName: "Profile",
		IsDeleted:     false,
		CreatedDate:   now,
		UpdatedDate:   now,
	}

	return &ImageTypeController{
		items: map[string]dto.ImageTypeDTO{
			sample.ID: sample,
		},
	}
}

func (c *ImageTypeController) List(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	c.mu.RLock()
	defer c.mu.RUnlock()

	response := make([]dto.ImageTypeDTO, 0, len(c.items))
	for _, item := range c.items {
		response = append(response, item)
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *ImageTypeController) GetByID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	c.mu.RLock()
	item, ok := c.items[id]
	c.mu.RUnlock()
	if !ok {
		http.Error(w, "image type not found", http.StatusNotFound)
		return
	}

	if err := json.NewEncoder(w).Encode(item); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *ImageTypeController) Create(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var payload dto.ImageTypeDTO
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()
	if payload.ID == "" {
		payload.ID = fmt.Sprintf("ITP-%d", now.UnixNano())
	}
	if payload.CreatedDate.IsZero() {
		payload.CreatedDate = now
	}
	payload.UpdatedDate = now

	c.mu.Lock()
	c.items[payload.ID] = payload
	c.mu.Unlock()

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *ImageTypeController) Update(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := r.PathValue("id")

	var payload dto.ImageTypeDTO
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "invalid request payload", http.StatusBadRequest)
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	existing, ok := c.items[id]
	if !ok {
		http.Error(w, "image type not found", http.StatusNotFound)
		return
	}

	payload.ID = id
	if payload.CreatedDate.IsZero() {
		payload.CreatedDate = existing.CreatedDate
	}
	payload.UpdatedDate = time.Now().UTC()
	c.items[id] = payload

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

func (c *ImageTypeController) Delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	c.mu.Lock()
	defer c.mu.Unlock()

	if _, ok := c.items[id]; !ok {
		http.Error(w, "image type not found", http.StatusNotFound)
		return
	}

	delete(c.items, id)
	w.WriteHeader(http.StatusNoContent)
}

