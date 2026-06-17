package model

import "time"

type UserPermission struct {
	ID          string     `json:"id"`
	UserRoleID  string     `json:"userRoleId"`
	ModuleName  string     `json:"moduleName"`
	CanCreate   bool       `json:"canCreate"`
	CanRead     bool       `json:"canRead"`
	CanUpdate   bool       `json:"canUpdate"`
	CanDelete   bool       `json:"canDelete"`
	IsDeleted   bool       `json:"isDeleted"`
	CreatedDate *time.Time `json:"createdDate,omitempty"`
	UpdatedDate *time.Time `json:"updatedDate,omitempty"`
	CreatedBy   string     `json:"createdBy,omitempty"`
	UpdatedBy   string     `json:"updatedBy,omitempty"`
}
