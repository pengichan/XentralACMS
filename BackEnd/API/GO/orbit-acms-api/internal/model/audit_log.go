package model

import (
	"time"
)

type AuditLog struct {
	LogID      string    `json:"logId"`
	Timestamp  time.Time `json:"timestamp"`
	Actor      string    `json:"actor"`
	ActorRole  string    `json:"actorRole"`
	ActionType string    `json:"actionType"`
	TargetType string    `json:"targetType"`
	TargetName string    `json:"targetName"`
	ServerName string    `json:"serverName"`
	SourceIP   string    `json:"sourceIp"`
	Result     string    `json:"result"`
	Severity   string    `json:"severity"`
	Details    string    `json:"details"`
}
