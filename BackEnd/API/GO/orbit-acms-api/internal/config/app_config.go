package config

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// GetDatabaseConnectionString reads appsetting.config and returns [database].connection_string.
func GetDatabaseConnectionString(configPath string) (string, error) {
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
