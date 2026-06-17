package model

import (
	"time"
)

type ReportsExportHistory struct {
	ExportID     string    `json:"exportId"`
	ExportedBy   string    `json:"exportedBy"`
	ExportType   string    `json:"exportType"`
	ExportFormat string    `json:"exportFormat"`
	ExportTime   time.Time `json:"exportTime"`
	Status       string    `json:"status"`
	Details      string    `json:"details"`
}
