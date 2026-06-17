-- 01_CreateTable.sql
-- SQL Server version: create core tables for Orbit ACMS with progress prints.

IF OBJECT_ID('dbo.user_role', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_role (
    id              VARCHAR(36) PRIMARY KEY,
    role_name       VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(500),
    is_deleted      BIT NOT NULL DEFAULT 0,
    created_date    DATETIME2,
    updated_date    DATETIME2,
    created_by      VARCHAR(100),
    updated_by      VARCHAR(100)
  );
  PRINT 'Created table: dbo.user_role';
END
ELSE
  PRINT 'Table already exists: dbo.user_role';

IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id              VARCHAR(36) PRIMARY KEY,
    user_role_id    VARCHAR(36) NOT NULL,
    user_id         NVARCHAR(MAX) NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    mobile_no       VARCHAR(30) NOT NULL,
    login_password  VARCHAR(255) NOT NULL,
    remark          VARCHAR(500),
    last_login      DATETIME2,
    is_active       BIT NOT NULL DEFAULT 1,
    is_deleted      BIT NOT NULL DEFAULT 0,
    created_date    DATETIME2 NOT NULL,
    updated_date    DATETIME2 NOT NULL,
    created_by      VARCHAR(100),
    updated_by      VARCHAR(100),
    CONSTRAINT fk_users_user_role
      FOREIGN KEY (user_role_id) REFERENCES dbo.user_role(id)
  );
  PRINT 'Created table: dbo.users';
END
ELSE
  PRINT 'Table already exists: dbo.users';

IF COL_LENGTH('dbo.users', 'user_id') IS NULL
BEGIN
  ALTER TABLE dbo.users ADD user_id NVARCHAR(MAX) NULL;
  UPDATE dbo.users SET user_id = email WHERE user_id IS NULL;
  ALTER TABLE dbo.users ALTER COLUMN user_id NVARCHAR(MAX) NOT NULL;
  PRINT 'Added column: dbo.users.user_id (NVARCHAR(MAX) NOT NULL)';
END
ELSE
  PRINT 'Column already exists: dbo.users.user_id';

IF OBJECT_ID('dbo.trg_users_user_id_unique', 'TR') IS NULL
BEGIN
  EXEC(N'
    CREATE TRIGGER dbo.trg_users_user_id_unique
    ON dbo.users
    AFTER INSERT, UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;

      IF EXISTS (
        SELECT 1
        FROM inserted
        GROUP BY user_id
        HAVING COUNT(*) > 1
      )
      OR EXISTS (
        SELECT 1
        FROM inserted i
        JOIN dbo.users u ON u.user_id = i.user_id AND u.id <> i.id
      )
      BEGIN
        ;THROW 50001, ''userID already exists'', 1;
      END
    END;
  ');
END
ELSE
BEGIN
  EXEC(N'
    ALTER TRIGGER dbo.trg_users_user_id_unique
    ON dbo.users
    AFTER INSERT, UPDATE
    AS
    BEGIN
      SET NOCOUNT ON;

      IF EXISTS (
        SELECT 1
        FROM inserted
        GROUP BY user_id
        HAVING COUNT(*) > 1
      )
      OR EXISTS (
        SELECT 1
        FROM inserted i
        JOIN dbo.users u ON u.user_id = i.user_id AND u.id <> i.id
      )
      BEGIN
        ;THROW 50001, ''userID already exists'', 1;
      END
    END;
  ');
END
PRINT 'Ensured trigger: dbo.trg_users_user_id_unique';

IF OBJECT_ID('dbo.user_permission', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_permission (
    id              VARCHAR(36) PRIMARY KEY,
    user_role_id    VARCHAR(36) NOT NULL,
    module_name     VARCHAR(100) NOT NULL,
    can_create      BIT NOT NULL DEFAULT 0,
    can_read        BIT NOT NULL DEFAULT 0,
    can_update      BIT NOT NULL DEFAULT 0,
    can_delete      BIT NOT NULL DEFAULT 0,
    is_deleted      BIT NOT NULL DEFAULT 0,
    created_date    DATETIME2,
    updated_date    DATETIME2,
    created_by      VARCHAR(100),
    updated_by      VARCHAR(100),
    CONSTRAINT fk_user_permission_user_role
      FOREIGN KEY (user_role_id) REFERENCES dbo.user_role(id),
    CONSTRAINT uq_user_permission_role_module
      UNIQUE (user_role_id, module_name)
  );
  PRINT 'Created table: dbo.user_permission';
END
ELSE
  PRINT 'Table already exists: dbo.user_permission';

IF OBJECT_ID('dbo.image_type', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.image_type (
    id                VARCHAR(36) PRIMARY KEY,
    image_type_name   VARCHAR(100) NOT NULL UNIQUE,
    is_deleted        BIT NOT NULL DEFAULT 0,
    created_date      DATETIME2 NOT NULL,
    updated_date      DATETIME2 NOT NULL,
    created_by        VARCHAR(100),
    updated_by        VARCHAR(100)
  );
  PRINT 'Created table: dbo.image_type';
END
ELSE
  PRINT 'Table already exists: dbo.image_type';

IF OBJECT_ID('dbo.user_image', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_image (
    id                VARCHAR(36) PRIMARY KEY,
    user_id           VARCHAR(36) NOT NULL,
    image_type_id     VARCHAR(36) NOT NULL,
    image_name        VARCHAR(255) NOT NULL,
    stored_directory  VARCHAR(500) NOT NULL,
    is_deleted        BIT NOT NULL DEFAULT 0,
    uploaded_date     DATETIME2 NOT NULL,
    uploaded_by       VARCHAR(100),
    CONSTRAINT fk_user_image_user
      FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_user_image_type
      FOREIGN KEY (image_type_id) REFERENCES dbo.image_type(id)
  );
  PRINT 'Created table: dbo.user_image';
END
ELSE
  PRINT 'Table already exists: dbo.user_image';

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'idx_users_user_role_id'
    AND object_id = OBJECT_ID('dbo.users')
)
BEGIN
  CREATE INDEX idx_users_user_role_id ON dbo.users(user_role_id);
  PRINT 'Created index: idx_users_user_role_id';
END
ELSE
  PRINT 'Index already exists: idx_users_user_role_id';

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'idx_user_permission_user_role_id'
    AND object_id = OBJECT_ID('dbo.user_permission')
)
BEGIN
  CREATE INDEX idx_user_permission_user_role_id ON dbo.user_permission(user_role_id);
  PRINT 'Created index: idx_user_permission_user_role_id';
END
ELSE
  PRINT 'Index already exists: idx_user_permission_user_role_id';

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'idx_user_image_user_id'
    AND object_id = OBJECT_ID('dbo.user_image')
)
BEGIN
  CREATE INDEX idx_user_image_user_id ON dbo.user_image(user_id);
  PRINT 'Created index: idx_user_image_user_id';
END
ELSE
  PRINT 'Index already exists: idx_user_image_user_id';

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'idx_user_image_image_type_id'
    AND object_id = OBJECT_ID('dbo.user_image')
)
BEGIN
  CREATE INDEX idx_user_image_image_type_id ON dbo.user_image(image_type_id);
  PRINT 'Created index: idx_user_image_image_type_id';
END
ELSE
  PRINT 'Index already exists: idx_user_image_image_type_id';

