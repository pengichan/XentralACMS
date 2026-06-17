package model

import "time"

type SessionAudit struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	ServerID    string    `json:"serverId"`
	TicketID    string    `json:"ticketId,omitempty"`
	StartTime   time.Time `json:"startTime"`
	EndTime     time.Time `json:"endTime,omitempty"`
	Protocol    string    `json:"protocol"` // e.g. SSH, RDP
	ClientIP    string    `json:"clientIp,omitempty"`
}
