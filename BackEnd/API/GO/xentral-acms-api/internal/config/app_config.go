package config

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// GetDatabaseConnectionString reads appsetting.config and returns [database].connection_string.
func GetDatabaseConnectionString(configPath string) (string, error) {
	if envConn := os.Getenv("XENTRAL_DB_CONNECTION"); envConn != "" {
		return envConn, nil
	}
	file, err := os.Open(configPath)
	if err != nil {
		return "", fmt.Errorf("open config: %w", err)
	}
	defer file.Close()

	section := ""
	connectionString := ""
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}

		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section = strings.ToLower(strings.TrimSpace(line[1 : len(line)-1]))
			continue
		}

		if section != "database" {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		if strings.EqualFold(strings.TrimSpace(key), "connection_string") {
			connectionString = strings.TrimSpace(value)
			break
		}
	}

	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("read config: %w", err)
	}
	if connectionString == "" {
		return "", fmt.Errorf("database.connection_string not found in %s", configPath)
	}

	return connectionString, nil
}

// GetDatabaseSecondaryConnectionString reads appsetting.config and returns [database].secondary_connection_string.
func GetDatabaseSecondaryConnectionString(configPath string) (string, error) {
	if envConn := os.Getenv("XENTRAL_DB_SECONDARY_CONNECTION"); envConn != "" {
		return envConn, nil
	}
	file, err := os.Open(configPath)
	if err != nil {
		return "", fmt.Errorf("open config: %w", err)
	}
	defer file.Close()

	section := ""
	connectionString := ""
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}

		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section = strings.ToLower(strings.TrimSpace(line[1 : len(line)-1]))
			continue
		}

		if section != "database" {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		if strings.EqualFold(strings.TrimSpace(key), "secondary_connection_string") {
			connectionString = strings.TrimSpace(value)
			break
		}
	}

	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("read config: %w", err)
	}
	if connectionString == "" {
		return "", fmt.Errorf("database.secondary_connection_string not found in %s", configPath)
	}

	return connectionString, nil
}


// SMTPConfig represents the configuration values for SMTP.
type SMTPConfig struct {
	Enabled  bool
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

// GetSMTPConfig parses appsetting.config and returns the [smtp] section.
func GetSMTPConfig(configPath string) (*SMTPConfig, error) {
	file, err := os.Open(configPath)
	if err != nil {
		return nil, fmt.Errorf("open config: %w", err)
	}
	defer file.Close()

	cfg := &SMTPConfig{
		Enabled: false,
	}
	section := ""
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}

		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section = strings.ToLower(strings.TrimSpace(line[1 : len(line)-1]))
			continue
		}

		if section != "smtp" {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.ToLower(strings.TrimSpace(key))
		value = strings.TrimSpace(value)

		switch key {
		case "enabled":
			cfg.Enabled = (value == "true" || value == "1")
		case "host":
			cfg.Host = value
		case "port":
			cfg.Port = value
		case "username":
			cfg.Username = value
		case "password":
			cfg.Password = value
		case "from":
			cfg.From = value
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	return cfg, nil
}

