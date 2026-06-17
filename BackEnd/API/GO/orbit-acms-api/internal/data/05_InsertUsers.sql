-- 05_InsertUsers.sql
-- SQL Server seed script for users table.

IF NOT EXISTS (
  SELECT 1
  FROM dbo.users
  WHERE email = 'admin@xentralacms.local'
)
BEGIN
  INSERT INTO dbo.users (
    id,
    user_role_id,
    user_id,
    first_name,
    last_name,
    email,
    mobile_no,
    login_password,
    remark,
    last_login,
    is_active,
    is_deleted,
    created_date,
    updated_date,
    created_by,
    updated_by
  )
  VALUES (
    '44444444-4444-4444-4444-444444444441',
    '11111111-1111-1111-1111-111111111111',
    'admin',
    'System',
    'Admin',
    'admin@xentralacms.local',
    '00000000000',
    'admin',
    'Default admin user for onboarding',
    GETDATE(),
    1,
    0,
    GETDATE(),
    GETDATE(),
    'SYSTEM',
    'SYSTEM'
  );
  PRINT 'Inserted user: admin@xentralacms.local';
END
ELSE
  PRINT 'User already exists: admin@xentralacms.local';
