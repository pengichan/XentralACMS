package model

import "time"

type Server struct {
	ID             string    `json:"id"`
	Hostname       string    `json:"hostname"`
	IPAddress      string    `json:"ipAddress"`
	OSType         string    `json:"osType"`
	Description    string    `json:"description,omitempty"`
	IsActive       bool      `json:"isActive"`
	IsDeleted      bool      `json:"isDeleted"`
	CreatedDate    time.Time `json:"createdDate"`
	UpdatedDate    time.Time `json:"updatedDate"`
	CreatedBy      string    `json:"createdBy,omitempty"`
	UpdatedBy      string    `json:"updatedBy,omitempty"`
	Environment    string    `json:"environment,omitempty"`
	Location       string    `json:"location,omitempty"`
	RemoteProtocol string    `json:"remoteProtocol,omitempty"`
	ServerStatus   string    `json:"serverStatus,omitempty"`
}
