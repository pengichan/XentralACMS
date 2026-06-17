package model

import "time"

type Ticket struct {
	ID                   string    `json:"id"`
	RequesterID          string    `json:"requesterId"`
	ApproverID           string    `json:"approverId,omitempty"`
	ServerID             string    `json:"serverId"`
	Reason               string    `json:"reason"`
	Status               string    `json:"status"` // "Pending", "Approved", "Rejected", "Expired"
	ValidUntil           time.Time `json:"validUntil,omitempty"`
	AssignedCredentialID string    `json:"assignedCredentialId,omitempty"`
	IsDeleted            bool      `json:"isDeleted"`
	CreatedDate          time.Time `json:"createdDate"`
	UpdatedDate          time.Time `json:"updatedDate"`
	CreatedBy            string    `json:"createdBy,omitempty"`
	UpdatedBy            string    `json:"updatedBy,omitempty"`
	RequestedStartTime   time.Time `json:"requestedStartTime,omitempty"`
	RequestedEndTime     time.Time `json:"requestedEndTime,omitempty"`
	AccessType           string    `json:"accessType,omitempty"`
	Urgency              string    `json:"urgency,omitempty"`
}
