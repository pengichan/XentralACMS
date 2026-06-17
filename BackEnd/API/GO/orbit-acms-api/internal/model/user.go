package model

import "time"

type User struct {
	ID            string    `json:"id"`
	UserRoleID    string    `json:"userRoleId"`
	UserID        string    `json:"userId"`
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
