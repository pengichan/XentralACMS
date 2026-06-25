-- 13_DatabaseOptimizations.sql
-- Optimizes table columns and adds missing indexes to prevent slow scans on login, ticketing, session audits, and user lists.

-- 1. Alter dbo.users.user_id if it is NVARCHAR(MAX) to NVARCHAR(100) NOT NULL
IF EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.users') 
      AND name = 'user_id' 
      AND max_length = -1
)
BEGIN
    ALTER TABLE dbo.users ALTER COLUMN user_id NVARCHAR(100) NOT NULL;
END;

-- 2. Ensure filtered unique index on active user_id
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'uq_users_user_id_active' AND object_id = OBJECT_ID('dbo.users')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX uq_users_user_id_active 
    ON dbo.users(user_id) 
    WHERE is_deleted = 0;
END;

-- 3. Ensure index on Ticket(RequesterID, Status, IsDeleted)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'idx_ticket_requester' AND object_id = OBJECT_ID('dbo.Ticket')
)
BEGIN
    CREATE NONCLUSTERED INDEX idx_ticket_requester 
    ON dbo.Ticket(RequesterID, Status, IsDeleted);
END;

-- 4. Ensure index on SessionAudit(UserID)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'idx_session_audit_user' AND object_id = OBJECT_ID('dbo.SessionAudit')
)
BEGIN
    CREATE NONCLUSTERED INDEX idx_session_audit_user 
    ON dbo.SessionAudit(UserID);
END;

-- 5. Ensure index on AuditLog(Actor)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes 
    WHERE name = 'idx_audit_log_actor' AND object_id = OBJECT_ID('dbo.AuditLog')
)
BEGIN
    CREATE NONCLUSTERED INDEX idx_audit_log_actor 
    ON dbo.AuditLog(Actor);
END;
