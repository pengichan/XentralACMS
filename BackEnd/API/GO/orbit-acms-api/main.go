package main

import (
	"database/sql"
	"log"
	"net/http"
	"strings"

	"orbit-acms-api/internal/config"
	"orbit-acms-api/internal/router"

	_ "github.com/microsoft/go-mssqldb"
)

func main() {
	connectionString, err := config.GetDatabaseConnectionString("appsetting.config")
	if err != nil {
		log.Fatal(err)
	}

	db, err := sql.Open("sqlserver", connectionString)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal(err)
	}

	mux := router.New(db)
	handler := withCORS(mux)

	addr := ":8080"
	log.Printf("API server running on http://localhost%s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

func withCORS(next http.Handler) http.Handler {
	allowedOrigins := map[string]bool{
		"http://localhost:5173": true,
		"http://127.0.0.1:5173": true,
		"http://localhost:5174": true,
		"http://127.0.0.1:5174": true,
		"http://localhost:4200": true,
		"http://127.0.0.1:4200": true,
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		// Preflight request for browsers.
		if r.Method == http.MethodOptions {
			if strings.TrimSpace(origin) == "" {
				http.Error(w, "origin required", http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
