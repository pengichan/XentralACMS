package controller

import (
	"encoding/json"
	"net/http"

	"orbit-acms-api/internal/dto"
	"orbit-acms-api/internal/model"
)

// HealthController handles health-related endpoints.
type HealthController struct{}

func NewHealthController() *HealthController {
	return &HealthController{}
}

func (c *HealthController) GetHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	health := model.Health{
		Status: "ok",
		API:    "orbit-acms-api",
	}

	response := dto.HealthResponse{
		Status: health.Status,
		API:    health.API,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
		return
	}
}

