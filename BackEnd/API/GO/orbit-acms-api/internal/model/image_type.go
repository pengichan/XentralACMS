package model

import "time"

type ImageType struct {
	ID            string    `json:"id"`
	ImageTypeName string    `json:"imageTypeName"`
	IsDeleted     bool      `json:"isDeleted"`
	CreatedDate   time.Time `json:"createdDate"`
	UpdatedDate   time.Time `json:"updatedDate"`
	CreatedBy     string    `json:"createdBy,omitempty"`
	UpdatedBy     string    `json:"updatedBy,omitempty"`
}
