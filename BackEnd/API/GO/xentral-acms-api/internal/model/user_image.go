package model

import "time"

type UserImage struct {
	ID              string    `json:"id"`
	UserID          string    `json:"userId"`
	ImageTypeID     string    `json:"imageTypeId"`
	ImageName       string    `json:"imageName"`
	StoredDirectory string    `json:"storedDirectory"`
	IsDeleted       bool      `json:"isDeleted"`
	UploadedDate    time.Time `json:"uploadedDate"`
	UploadedBy      string    `json:"uploadedBy,omitempty"`
}
