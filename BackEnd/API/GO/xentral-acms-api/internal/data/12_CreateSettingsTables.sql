-- 12_CreateSettingsTables.sql
-- Create system settings and SMTP profiles tables with default seed records.

IF OBJECT_ID('dbo.smtp_settings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.smtp_settings (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    profile_name VARCHAR(100) NOT NULL DEFAULT 'Default SMTP',
    enabled      BIT NOT NULL DEFAULT 0,
    host         VARCHAR(255) NULL,
    port         VARCHAR(10) NULL,
    username     VARCHAR(255) NULL,
    password     VARCHAR(255) NULL,
    sender_from  VARCHAR(255) NULL,
    is_active    BIT NOT NULL DEFAULT 0,
    updated_date DATETIME2 NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: dbo.smtp_settings';
END
ELSE
  PRINT 'Table already exists: dbo.smtp_settings';

IF NOT EXISTS (
  SELECT 1 FROM dbo.smtp_settings
)
BEGIN
  INSERT INTO dbo.smtp_settings (profile_name, enabled, host, port, username, password, sender_from, is_active, updated_date)
  VALUES ('Default SMTP (Mock)', 0, 'smtp.example.com', '587', 'admin@example.com', 'password', 'no-reply@XentralACMS.local', 1, GETUTCDATE());
  PRINT 'Seeded default mock SMTP profile';
END

IF OBJECT_ID('dbo.system_settings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.system_settings (
    id                         INT IDENTITY(1,1) PRIMARY KEY,
    inactivity_timeout_minutes INT NOT NULL DEFAULT 15,
    min_password_length        INT NOT NULL DEFAULT 8,
    force_password_reset       BIT NOT NULL DEFAULT 1,
    audit_log_retention_days   INT NOT NULL DEFAULT 90,
    updated_date               DATETIME2 NOT NULL DEFAULT GETDATE()
  );
  PRINT 'Created table: dbo.system_settings';
END
ELSE
  PRINT 'Table already exists: dbo.system_settings';

IF NOT EXISTS (
  SELECT 1 FROM dbo.system_settings WHERE id = 1
)
BEGIN
  INSERT INTO dbo.system_settings (inactivity_timeout_minutes, min_password_length, force_password_reset, audit_log_retention_days)
  VALUES (15, 8, 1, 90);
  PRINT 'Seeded default system settings';
END

