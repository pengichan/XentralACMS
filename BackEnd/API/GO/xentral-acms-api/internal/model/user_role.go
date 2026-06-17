package model

import "time"

type UserRole struct {
	ID          string     `json:"id"`
	RoleName    string     `json:"roleName"`
	Description string     `json:"description,omitempty"`
	IsDeleted   bool       `json:"isDeleted"`
	CreatedDate *time.Time `json:"createdDate,omitempty"`
	UpdatedDate *time.Time `json:"updatedDate,omitempty"`
	CreatedBy   string     `json:"createdBy,omitempty"`
	UpdatedBy   string     `json:"updatedBy,omitempty"`
}
