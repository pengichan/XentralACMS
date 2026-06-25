package controller

import (
	"context"
	"log"

	"github.com/philippseith/signalr"
)

// EventHub is the SignalR Hub for real-time notifications
type EventHub struct {
	signalr.Hub
}

// GlobalSignalRServer is the global SignalR server instance
var GlobalSignalRServer signalr.Server

// InitSignalR initializes the global SignalR server and Hub
func InitSignalR() {
	server, err := signalr.NewServer(
		context.Background(),
		signalr.UseHub(&EventHub{}),
		signalr.KeepAliveInterval(15),
	)
	if err != nil {
		log.Printf("[SIGNALR ERROR] Failed to initialize SignalR server: %v", err)
		return
	}
	GlobalSignalRServer = server
	log.Println("[SIGNALR] Server successfully initialized")
}
