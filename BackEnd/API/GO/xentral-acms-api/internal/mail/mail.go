package mail

import (
	"database/sql"
	"fmt"
	"log"
	"net/smtp"
	"os"
	"strings"
	"time"

	"xentral-acms-api/internal/config"
)

type Mailer struct {
	db  *sql.DB
	cfg *config.SMTPConfig
}

func NewMailer(db *sql.DB, cfg *config.SMTPConfig) *Mailer {
	return &Mailer{db: db, cfg: cfg}
}

// SendMail sends an email to the specified recipients. It queries dbo.smtp_settings dynamically 
// if db is present, otherwise falling back to file settings. If SMTP is disabled, it writes to sent_emails.log.
func (m *Mailer) SendMail(to []string, subject, body string) error {
	if m.db != nil {
		var enabled bool
		var host, port, username, password, senderFrom string
		err := m.db.QueryRow(`
			SELECT TOP 1 enabled, host, port, username, password, sender_from
			FROM dbo.smtp_settings
			WHERE is_active = 1
		`).Scan(&enabled, &host, &port, &username, &password, &senderFrom)
		if err == nil {
			m.cfg = &config.SMTPConfig{
				Enabled:  enabled,
				Host:     host,
				Port:     port,
				Username: username,
				Password: password,
				From:     senderFrom,
			}
		}
	}

	if m.cfg == nil {
		m.cfg = &config.SMTPConfig{Enabled: false}
	}

	msg := fmt.Sprintf("From: %s\r\n"+
		"To: %s\r\n"+
		"Subject: %s\r\n"+
		"Content-Type: text/plain; charset=UTF-8\r\n"+
		"\r\n"+
		"%s\r\n", m.cfg.From, strings.Join(to, ", "), subject, body)

	if !m.cfg.Enabled {
		// Mock Mode: log email to console and a local log file
		logEntry := fmt.Sprintf("========================================\n"+
			"TIMESTAMP: %s\n"+
			"TO: %s\n"+
			"SUBJECT: %s\n"+
			"BODY:\n%s\n"+
			"========================================\n",
			time.Now().Format(time.RFC3339), strings.Join(to, ", "), subject, body)

		log.Printf("[MOCK MAIL] Writing email to log file (SMTP Disabled):\nTo: %s\nSubject: %s\n", strings.Join(to, ", "), subject)
		
		// Write to local log file in the execution directory
		logFile := "sent_emails.log"
		f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
		if err == nil {
			defer f.Close()
			_, _ = f.WriteString(logEntry)
		} else {
			log.Printf("[MOCK MAIL ERROR] Failed to write mock email to file: %v", err)
		}
		return nil
	}

	// Real SMTP Mode
	var auth smtp.Auth
	if m.cfg.Username != "" && m.cfg.Password != "" {
		auth = smtp.PlainAuth("", m.cfg.Username, m.cfg.Password, m.cfg.Host)
	}
	addr := fmt.Sprintf("%s:%s", m.cfg.Host, m.cfg.Port)
	err := smtp.SendMail(addr, auth, m.cfg.From, to, []byte(msg))
	if err != nil {
		log.Printf("[MAIL ERROR] Failed to send email to %s: %v", strings.Join(to, ", "), err)
		return err
	}

	log.Printf("[MAIL] Successfully sent email to %s: %s", strings.Join(to, ", "), subject)
	return nil
}

