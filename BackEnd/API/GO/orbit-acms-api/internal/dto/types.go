package dto

import "time"

type HealthResponse struct {
	Status string `json:"status"`
	API    string `json:"api"`
}

type ImageTypeDTO struct {
	ID            string    `json:"id"`
	ImageTypeName string    `json:"imageTypeName"`
	IsDeleted     bool      `json:"isDeleted"`
	CreatedDate   time.Time `json:"createdDate"`
	UpdatedDate   time.Time `json:"updatedDate"`
	CreatedBy     string    `json:"createdBy,omitempty"`
	UpdatedBy     string    `json:"updatedBy,omitempty"`
}

type UserImageDTO struct {
	ID              string    `json:"id"`
	UserID          string    `json:"userId"`
	ImageTypeID     string    `json:"imageTypeId"`
	ImageName       string    `json:"imageName"`
	StoredDirectory string    `json:"storedDirectory"`
	IsDeleted       bool      `json:"isDeleted"`
	UploadedDate    time.Time `json:"uploadedDate"`
	UploadedBy      string    `json:"uploadedBy,omitempty"`
}

type UserPermissionDTO struct {
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

type UserRoleDTO struct {
	ID          string     `json:"id"`
	RoleName    string     `json:"roleName"`
	Description string     `json:"description,omitempty"`
	IsDeleted   bool       `json:"isDeleted"`
	CreatedDate *time.Time `json:"createdDate,omitempty"`
	UpdatedDate *time.Time `json:"updatedDate,omitempty"`
	CreatedBy   string     `json:"createdBy,omitempty"`
	UpdatedBy   string     `json:"updatedBy,omitempty"`
}

type UserDTO struct {
	ID            string    `json:"id"`
	UserRoleID    string    `json:"userRoleId"`
	UserID        string    `json:"userId"`
	UserIDSnake   string    `json:"user_id,omitempty"`
	FirstName     string    `json:"firstName"`
	LastName      string    `json:"lastName"`
	Email         string    `json:"email"`
	MobileNo      string    `json:"mobileNo"`
	LoginPassword string    `json:"loginPassword,omitempty"`
	Remark        string    `json:"remark,omitempty"`
	LastLogin     time.Time `json:"lastLogin,omitempty"`
	IsActive      bool      `json:"isActive"`
	IsDeleted     bool      `json:"isDeleted"`
	CreatedDate   time.Time `json:"createdDate"`
	UpdatedDate   time.Time `json:"updatedDate"`
	CreatedBy     string    `json:"createdBy,omitempty"`
	UpdatedBy     string    `json:"updatedBy,omitempty"`
}
