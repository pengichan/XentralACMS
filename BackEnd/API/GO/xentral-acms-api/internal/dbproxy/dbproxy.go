package dbproxy

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// DB defines the custom interface compatible with standard *sql.DB operations.
type DB interface {
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
	Exec(query string, args ...any) (sql.Result, error)
	Ping() error
	Close() error
}

// Proxy is a database proxy that manages redundancy and automatic failover.
type Proxy struct {
	primary          *sql.DB
	secondary        *sql.DB
	primaryHealthy   bool
	lastPrimaryCheck time.Time
	mu               sync.Mutex
}

// NewProxy creates a new redundancy database proxy and runs configuration tasks.
func NewProxy(primaryConnStr, secondaryConnStr string) (*Proxy, error) {
	// 1. Check/create secondary database first via master DB connection
	masterConnStr := getMasterConnectionString(secondaryConnStr)
	masterDB, err := sql.Open("sqlserver", masterConnStr)
	if err != nil {
		return nil, fmt.Errorf("connect to master DB: %w", err)
	}
	defer masterDB.Close()

	log.Println("[REDUNDANCY] Verifying existence of Secondary Database...")
	_, err = masterDB.Exec(`
		IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'OrbitACMS_Secondary')
		BEGIN
			CREATE DATABASE OrbitACMS_Secondary;
		END
	`)
	if err != nil {
		return nil, fmt.Errorf("create secondary database: %w", err)
	}

	// 2. Open primary and secondary DB connections
	primary, err := sql.Open("sqlserver", primaryConnStr)
	if err != nil {
		return nil, fmt.Errorf("open primary DB: %w", err)
	}

	secondary, err := sql.Open("sqlserver", secondaryConnStr)
	if err != nil {
		return nil, fmt.Errorf("open secondary DB: %w", err)
	}

	p := &Proxy{
		primary:        primary,
		secondary:      secondary,
		primaryHealthy: true,
	}

	// 3. Clone schemas of base tables if missing on secondary
	if err := p.cloneSchemas(); err != nil {
		log.Printf("[REDUNDANCY ERROR] Schema cloning failed: %v", err)
	}

	// 4. Start health monitor and replication worker
	go p.monitorPrimaryHealth()
	go p.startReplicationWorker()

	return p, nil
}

// getActiveDB selects the primary database if healthy, otherwise the secondary.
func (r *Proxy) getActiveDB() *sql.DB {
	r.mu.Lock()
	defer r.mu.Unlock()

	// If primary was unhealthy, check if we should retry pinging it (throttled to once per 10 seconds)
	if !r.primaryHealthy {
		if time.Since(r.lastPrimaryCheck) > 10*time.Second {
			r.lastPrimaryCheck = time.Now()
			if err := r.primary.Ping(); err == nil {
				r.primaryHealthy = true
				log.Println("[REDUNDANCY] Primary DB recovered. Swapped back to Primary DB.")
			}
		}
	}

	if r.primaryHealthy {
		return r.primary
	}
	return r.secondary
}

// handleFailover marks the primary database as unhealthy and forces failover.
func (r *Proxy) handleFailover(failedDB *sql.DB) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if failedDB == r.primary && r.primaryHealthy {
		r.primaryHealthy = false
		r.lastPrimaryCheck = time.Now()
		log.Println("[REDUNDANCY WARNING] Primary DB connection failed. Swapping to Secondary DB as backup.")
	}
}

// isConnectionError checks if the given error is a database connection/network error.
func (r *Proxy) isConnectionError(err error) bool {
	if err == nil {
		return false
	}
	errMsg := strings.ToLower(err.Error())
	return err == driver.ErrBadConn ||
		strings.Contains(errMsg, "connection") ||
		strings.Contains(errMsg, "refused") ||
		strings.Contains(errMsg, "dial") ||
		strings.Contains(errMsg, "network") ||
		strings.Contains(errMsg, "eof") ||
		strings.Contains(errMsg, "closed") ||
		strings.Contains(errMsg, "cannot open database") ||
		strings.Contains(errMsg, "login error") ||
		strings.Contains(errMsg, "server is not currently accepting") ||
		strings.Contains(errMsg, "offline") ||
		strings.Contains(errMsg, "unavailable") ||
		strings.Contains(errMsg, "timeout")
}

// Query executes a query on the active database with transparent failover.
func (r *Proxy) Query(query string, args ...any) (*sql.Rows, error) {
	db := r.getActiveDB()
	rows, err := db.Query(query, args...)
	if err != nil && r.isConnectionError(err) {
		r.handleFailover(db)
		return r.getActiveDB().Query(query, args...)
	}
	return rows, err
}

// QueryRow executes a query on the active database and returns standard *sql.Row.
func (r *Proxy) QueryRow(query string, args ...any) *sql.Row {
	return r.getActiveDB().QueryRow(query, args...)
}

// Exec executes a command on the active database with transparent failover.
func (r *Proxy) Exec(query string, args ...any) (sql.Result, error) {
	db := r.getActiveDB()
	res, err := db.Exec(query, args...)
	if err != nil && r.isConnectionError(err) {
		r.handleFailover(db)
		return r.getActiveDB().Exec(query, args...)
	}
	return res, err
}

// Ping checks health on both databases.
func (r *Proxy) Ping() error {
	db := r.getActiveDB()
	return db.Ping()
}

// Close closes both databases.
func (r *Proxy) Close() error {
	err1 := r.primary.Close()
	err2 := r.secondary.Close()
	if err1 != nil {
		return err1
	}
	return err2
}

// cloneSchemas copies base tables schemas from primary database to secondary database if missing.
func (r *Proxy) cloneSchemas() error {
	rows, err := r.primary.Query(`
		SELECT TABLE_NAME 
		FROM INFORMATION_SCHEMA.TABLES 
		WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'dbo'
	`)
	if err != nil {
		return fmt.Errorf("query primary base tables: %w", err)
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			tables = append(tables, name)
		}
	}

	for _, table := range tables {
		var exists int
		err := r.secondary.QueryRow(`
			SELECT COUNT(1) 
			FROM INFORMATION_SCHEMA.TABLES 
			WHERE TABLE_NAME = @p1 AND TABLE_SCHEMA = 'dbo'
		`, table).Scan(&exists)
		if err != nil {
			log.Printf("[REDUNDANCY ERROR] Failed to check table %s in secondary: %v", table, err)
			continue
		}

		if exists == 0 {
			log.Printf("[REDUNDANCY] Table %s does not exist on secondary. Cloning schema...", table)
			if err := r.cloneTable(table); err != nil {
				log.Printf("[REDUNDANCY ERROR] Failed to clone table %s: %v", table, err)
			} else {
				log.Printf("[REDUNDANCY] Table %s cloned successfully.", table)
			}
		}
	}
	return nil
}

// cloneTable reads schema metadata and creates the matching table on the secondary.
func (r *Proxy) cloneTable(tableName string) error {
	// 1. Identity check
	identityCols := make(map[string]bool)
	idRows, err := r.primary.Query(`
		SELECT COLUMN_NAME 
		FROM INFORMATION_SCHEMA.COLUMNS 
		WHERE COLUMNPROPERTY(object_id(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') = 1
		  AND TABLE_NAME = @p1
	`, tableName)
	if err == nil {
		for idRows.Next() {
			var col string
			if err := idRows.Scan(&col); err == nil {
				identityCols[col] = true
			}
		}
		idRows.Close()
	}

	// 2. PK check
	pkCols := make(map[string]bool)
	pkRows, err := r.primary.Query(`
		SELECT c.name
		FROM sys.key_constraints k
		JOIN sys.index_columns ic ON ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id
		JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
		WHERE k.type = 'PK' AND k.parent_object_id = object_id('dbo.' + @p1)
	`, tableName)
	if err == nil {
		for pkRows.Next() {
			var col string
			if err := pkRows.Scan(&col); err == nil {
				pkCols[col] = true
			}
		}
		pkRows.Close()
	}

	// 3. Column schema query
	colRows, err := r.primary.Query(`
		SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_DEFAULT
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_NAME = @p1 AND TABLE_SCHEMA = 'dbo'
		ORDER BY ORDINAL_POSITION
	`, tableName)
	if err != nil {
		return fmt.Errorf("query columns info: %w", err)
	}
	defer colRows.Close()

	var colDefs []string
	for colRows.Next() {
		var colName, dataType, isNullable string
		var charLength *int
		var colDefault *string
		if err := colRows.Scan(&colName, &dataType, &charLength, &isNullable, &colDefault); err != nil {
			return fmt.Errorf("scan columns info: %w", err)
		}

		def := fmt.Sprintf("%s %s", colName, dataType)
		if charLength != nil {
			if *charLength == -1 {
				def += "(MAX)"
			} else {
				def += fmt.Sprintf("(%d)", *charLength)
			}
		}

		if identityCols[colName] {
			def += " IDENTITY(1,1)"
		}

		if pkCols[colName] {
			def += " PRIMARY KEY"
		} else {
			if isNullable == "NO" {
				def += " NOT NULL"
			}
		}

		if colDefault != nil {
			def += fmt.Sprintf(" DEFAULT %s", *colDefault)
		}

		colDefs = append(colDefs, def)
	}

	query := fmt.Sprintf("CREATE TABLE dbo.%s (%s)", tableName, strings.Join(colDefs, ", "))
	_, err = r.secondary.Exec(query)
	if err != nil {
		return fmt.Errorf("execute CREATE TABLE for %s: %w", tableName, err)
	}
	return nil
}

// monitorPrimaryHealth regularly checks the health of the primary database and performs sync-up catchups.
func (r *Proxy) monitorPrimaryHealth() {
	ticker := time.NewTicker(10 * time.Second)
	for range ticker.C {
		r.mu.Lock()
		isHealthy := r.primaryHealthy
		r.mu.Unlock()

		if !isHealthy {
			if err := r.primary.Ping(); err == nil {
				log.Println("[REDUNDANCY] Primary DB detected back online. Initiating catch-up synchronization...")

				// Sync Secondary (which had writes) -> Primary
				if err := r.replicateRows(r.secondary, r.primary); err != nil {
					log.Printf("[REDUNDANCY ERROR] Catch-up synchronization failed: %v", err)
					continue
				}

				log.Println("[REDUNDANCY] Catch-up sync completed successfully. Swapping active master to Primary DB.")
				r.mu.Lock()
				r.primaryHealthy = true
				r.lastPrimaryCheck = time.Now()
				r.mu.Unlock()
			}
		}
	}
}

// startReplicationWorker triggers the scheduled 1-minute synchronization task.
func (r *Proxy) startReplicationWorker() {
	ticker := time.NewTicker(60 * time.Second)
	for range ticker.C {
		r.mu.Lock()
		isPrimaryActive := r.primaryHealthy
		r.mu.Unlock()

		if isPrimaryActive {
			if err := r.secondary.Ping(); err == nil {
				log.Println("[REDUNDANCY] Running scheduled 60s synchronization (Primary -> Secondary)...")
				if err := r.replicateRows(r.primary, r.secondary); err != nil {
					log.Printf("[REDUNDANCY ERROR] 60s synchronization failed: %v", err)
				} else {
					log.Println("[REDUNDANCY] 60s synchronization completed successfully.")
				}
			} else {
				log.Printf("[REDUNDANCY WARNING] Secondary DB unreachable. Skipping scheduled synchronization.")
			}
		}
	}
}

// replicateRows clones row updates and purges deletions table-by-table.
func (r *Proxy) replicateRows(src, dest *sql.DB) error {
	rows, err := src.Query(`
		SELECT TABLE_NAME 
		FROM INFORMATION_SCHEMA.TABLES 
		WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'dbo'
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			tables = append(tables, name)
		}
	}

	for _, table := range tables {
		if err := r.replicateTable(src, dest, table); err != nil {
			log.Printf("[REDUNDANCY ERROR] Sync failed for table %s: %v", table, err)
		}
	}
	return nil
}

// getColumnTypes returns a map of column name -> DATA_TYPE for a table.
func (r *Proxy) getColumnTypes(db *sql.DB, tableName string) (map[string]string, []string, error) {
	rows, err := db.Query(`
		SELECT COLUMN_NAME, DATA_TYPE
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_NAME = @p1 AND TABLE_SCHEMA = 'dbo'
		ORDER BY ORDINAL_POSITION
	`, tableName)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()

	colTypes := make(map[string]string)
	var orderedCols []string
	for rows.Next() {
		var colName, dataType string
		if err := rows.Scan(&colName, &dataType); err != nil {
			return nil, nil, err
		}
		colTypes[colName] = strings.ToLower(dataType)
		orderedCols = append(orderedCols, colName)
	}
	return colTypes, orderedCols, nil
}

// buildSelectQuery constructs a SELECT that casts UNIQUEIDENTIFIER columns to VARCHAR(36)
// so the Go driver receives them as strings instead of raw 16-byte blobs.
func buildSelectQuery(tableName string, cols []string, colTypes map[string]string) string {
	parts := make([]string, len(cols))
	for i, col := range cols {
		if colTypes[col] == "uniqueidentifier" {
			parts[i] = fmt.Sprintf("CONVERT(VARCHAR(36), %s) AS %s", col, col)
		} else {
			parts[i] = col
		}
	}
	return fmt.Sprintf("SELECT %s FROM dbo.%s", strings.Join(parts, ", "), tableName)
}

// replicateTable synchronizes columns, updates modified rows, and clears deletions.
func (r *Proxy) replicateTable(src, dest *sql.DB, tableName string) error {
	pkCol, err := r.getPrimaryKeyColumn(src, tableName)
	if err != nil {
		return fmt.Errorf("get PK: %w", err)
	}

	hasIdentity := r.hasIdentityColumn(src, tableName)

	// Get column types to handle UNIQUEIDENTIFIER correctly
	colTypes, orderedCols, err := r.getColumnTypes(src, tableName)
	if err != nil {
		return fmt.Errorf("get column types: %w", err)
	}

	selectQuery := buildSelectQuery(tableName, orderedCols, colTypes)

	// 1. Read source using typed SELECT (GUIDs cast to VARCHAR)
	srcRows, err := src.Query(selectQuery)
	if err != nil {
		return fmt.Errorf("read src: %w", err)
	}
	defer srcRows.Close()

	cols, err := srcRows.Columns()
	if err != nil {
		return err
	}

	pkIdx := -1
	for i, col := range cols {
		if strings.EqualFold(col, pkCol) {
			pkIdx = i
			break
		}
	}
	if pkIdx == -1 {
		return fmt.Errorf("pk column not found in columns list")
	}

	type RowData struct {
		vals []any
	}
	srcMap := make(map[any]RowData)

	for srcRows.Next() {
		vals := make([]any, len(cols))
		valPtrs := make([]any, len(cols))
		for i := range vals {
			valPtrs[i] = &vals[i]
		}
		if err := srcRows.Scan(valPtrs...); err != nil {
			return err
		}
		normVals := make([]any, len(cols))
		for i, val := range vals {
			normVals[i] = normalizeVal(val)
		}
		pkVal := normVals[pkIdx]
		srcMap[pkVal] = RowData{vals: normVals}
	}

	// 2. Read destination using same typed SELECT
	destRows, err := dest.Query(selectQuery)
	if err != nil {
		return fmt.Errorf("read dest: %w", err)
	}
	defer destRows.Close()

	destMap := make(map[any]RowData)
	for destRows.Next() {
		vals := make([]any, len(cols))
		valPtrs := make([]any, len(cols))
		for i := range vals {
			valPtrs[i] = &vals[i]
		}
		if err := destRows.Scan(valPtrs...); err != nil {
			return err
		}
		normVals := make([]any, len(cols))
		for i, val := range vals {
			normVals[i] = normalizeVal(val)
		}
		pkVal := normVals[pkIdx]
		destMap[pkVal] = RowData{vals: normVals}
	}

	// 3. Connect to destination
	ctx := context.Background()
	conn, err := dest.Conn(ctx)
	if err != nil {
		return fmt.Errorf("dest conn: %w", err)
	}
	defer conn.Close()

	// 4. Perform synchronization (Inserts / Updates)
	for pkVal, srcRow := range srcMap {
		destRow, exists := destMap[pkVal]
		if !exists {
			ph := make([]string, len(cols))
			for i, col := range cols {
				if colTypes[col] == "uniqueidentifier" {
					ph[i] = fmt.Sprintf("CAST(@p%d AS UNIQUEIDENTIFIER)", i+1)
				} else {
					ph[i] = fmt.Sprintf("@p%d", i+1)
				}
			}
			insertQuery := fmt.Sprintf("INSERT INTO dbo.%s (%s) VALUES (%s)", tableName, strings.Join(cols, ", "), strings.Join(ph, ", "))

			if hasIdentity {
				_, _ = conn.ExecContext(ctx, fmt.Sprintf("SET IDENTITY_INSERT dbo.%s ON", tableName))
			}
			_, err = conn.ExecContext(ctx, insertQuery, srcRow.vals...)
			if hasIdentity {
				_, _ = conn.ExecContext(ctx, fmt.Sprintf("SET IDENTITY_INSERT dbo.%s OFF", tableName))
			}
			if err != nil {
				return fmt.Errorf("sync insert failed: %w", err)
			}
		} else {
			if !rowEquals(srcRow.vals, destRow.vals) {
				setClauses := []string{}
				setArgs := []any{}
				paramIndex := 1
				for i, col := range cols {
					if i == pkIdx {
						continue
					}
					if colTypes[col] == "uniqueidentifier" {
						setClauses = append(setClauses, fmt.Sprintf("%s = CAST(@p%d AS UNIQUEIDENTIFIER)", col, paramIndex))
					} else {
						setClauses = append(setClauses, fmt.Sprintf("%s = @p%d", col, paramIndex))
					}
					setArgs = append(setArgs, srcRow.vals[i])
					paramIndex++
				}
				setArgs = append(setArgs, pkVal)
				pkPlaceholder := fmt.Sprintf("@p%d", paramIndex)
				if colTypes[pkCol] == "uniqueidentifier" {
					pkPlaceholder = fmt.Sprintf("CAST(@p%d AS UNIQUEIDENTIFIER)", paramIndex)
				}
				updateQuery := fmt.Sprintf("UPDATE dbo.%s SET %s WHERE %s = %s", tableName, strings.Join(setClauses, ", "), pkCol, pkPlaceholder)
				_, err = conn.ExecContext(ctx, updateQuery, setArgs...)
				if err != nil {
					return fmt.Errorf("sync update failed: %w", err)
				}
			}
		}
	}

	// 5. Purge Deleted Rows
	for pkVal := range destMap {
		if _, exists := srcMap[pkVal]; !exists {
			pkPlaceholder := "@p1"
			if colTypes[pkCol] == "uniqueidentifier" {
				pkPlaceholder = "CAST(@p1 AS UNIQUEIDENTIFIER)"
			}
			deleteQuery := fmt.Sprintf("DELETE FROM dbo.%s WHERE %s = %s", tableName, pkCol, pkPlaceholder)
			_, err = conn.ExecContext(ctx, deleteQuery, pkVal)
			if err != nil {
				return fmt.Errorf("sync delete failed: %w", err)
			}
		}
	}
	return nil
}

// getPrimaryKeyColumn fetches the constraint name of the PK column.
func (r *Proxy) getPrimaryKeyColumn(db *sql.DB, tableName string) (string, error) {
	var pkCol string
	err := db.QueryRow(`
		SELECT c.name
		FROM sys.key_constraints k
		JOIN sys.index_columns ic ON ic.object_id = k.parent_object_id AND ic.index_id = k.unique_index_id
		JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
		WHERE k.type = 'PK' AND k.parent_object_id = object_id('dbo.' + @p1)
	`, tableName).Scan(&pkCol)
	return pkCol, err
}

// hasIdentityColumn checks if there's any identity column on the database.
func (r *Proxy) hasIdentityColumn(db *sql.DB, tableName string) bool {
	var count int
	_ = db.QueryRow(`
		SELECT COUNT(1) 
		FROM INFORMATION_SCHEMA.COLUMNS 
		WHERE COLUMNPROPERTY(object_id(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsIdentity') = 1
		  AND TABLE_NAME = @p1
	`, tableName).Scan(&count)
	return count > 0
}

// normalizeVal converts raw byte slices to strings for robust comparison.
func normalizeVal(val any) any {
	if val == nil {
		return nil
	}
	if b, ok := val.([]byte); ok {
		return string(b)
	}
	return val
}

// rowEquals checks column value equalities.
func rowEquals(vals1, vals2 []any) bool {
	if len(vals1) != len(vals2) {
		return false
	}
	for i := range vals1 {
		v1 := vals1[i]
		v2 := vals2[i]
		if v1 == nil && v2 == nil {
			continue
		}
		if (v1 == nil && v2 != nil) || (v1 != nil && v2 == nil) {
			return false
		}

		t1, ok1 := v1.(time.Time)
		t2, ok2 := v2.(time.Time)
		if ok1 && ok2 {
			if !t1.Equal(t2) {
				return false
			}
			continue
		}

		f1, okf1 := v1.(float64)
		f2, okf2 := v2.(float64)
		if okf1 && okf2 {
			if f1 != f2 {
				return false
			}
			continue
		}

		if fmt.Sprintf("%v", v1) != fmt.Sprintf("%v", v2) {
			return false
		}
	}
	return true
}

// getMasterConnectionString redirects the database target to master database in connection strings.
func getMasterConnectionString(connStr string) string {
	if strings.Contains(connStr, "database=OrbitACMS_Secondary") {
		return strings.Replace(connStr, "database=OrbitACMS_Secondary", "database=master", 1)
	}
	if strings.Contains(connStr, "database=OrbitACMS") {
		return strings.Replace(connStr, "database=OrbitACMS", "database=master", 1)
	}
	return connStr
}
