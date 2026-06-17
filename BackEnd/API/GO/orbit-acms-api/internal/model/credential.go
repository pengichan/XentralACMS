package model

import "time"

type Credential struct {
	ID                string    `json:"id"`
	ServerID          string    `json:"serverId"`
	Username          string    `json:"username"`
	EncryptedPassword string    `json:"encryptedPassword,omitempty"`
	SecretType        string    `json:"secretType"`  // e.g., "Password", "SSH Key"
	AccountType       string    `json:"accountType"` // "Local" or "AD"
	IsActive          bool      `json:"isActive"`
	IsDeleted         bool      `json:"isDeleted"`
	CreatedDate       time.Time `json:"createdDate"`
	UpdatedDate       time.Time `json:"updatedDate"`
	CreatedBy         string    `json:"createdBy,omitempty"`
	UpdatedBy         string    `json:"updatedBy,omitempty"`
}
