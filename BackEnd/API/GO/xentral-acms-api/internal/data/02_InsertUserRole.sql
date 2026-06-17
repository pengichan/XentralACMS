-- 02_InsertUserRole.sql
-- SQL Server seed script for user_role table.

IF NOT EXISTS (
  SELECT 1
  FROM dbo.user_role
  WHERE role_name = 'ADMIN'
)
BEGIN
  INSERT INTO dbo.user_role (id, role_name, description, is_deleted, created_date, updated_date, created_by, updated_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'ADMIN', 'System administrator role', 0, GETDATE(), GETDATE(), 'SYSTEM', 'SYSTEM');
  PRINT 'Inserted role: ADMIN';
END
ELSE
  PRINT 'Role already exists: ADMIN';

IF NOT EXISTS (
  SELECT 1
  FROM dbo.user_role
  WHERE role_name = 'USER'
)
BEGIN
  INSERT INTO dbo.user_role (id, role_name, description, is_deleted, created_date, updated_date, created_by, updated_by)
  VALUES ('22222222-2222-2222-2222-222222222222', 'USER', 'Standard application user role', 0, GETDATE(), GETDATE(), 'SYSTEM', 'SYSTEM');
  PRINT 'Inserted role: USER';
END
ELSE
  PRINT 'Role already exists: USER';

IF NOT EXISTS (
  SELECT 1
  FROM dbo.user_role
  WHERE role_name = 'SUPER_ADMIN'
)
BEGIN
  INSERT INTO dbo.user_role (id, role_name, description, is_deleted, created_date, updated_date, created_by, updated_by)
  VALUES ('00000000-0000-0000-0000-000000000001', 'SUPER_ADMIN', 'Super administrator with full system access', 0, GETDATE(), GETDATE(), 'SYSTEM', 'SYSTEM');
  PRINT 'Inserted role: SUPER_ADMIN';
END
ELSE
  PRINT 'Role already exists: SUPER_ADMIN';
