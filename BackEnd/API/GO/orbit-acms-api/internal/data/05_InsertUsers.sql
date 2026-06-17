-- 05_InsertUsers.sql
-- SQL Server seed script for users table.

IF NOT EXISTS (
  SELECT 1
  FROM dbo.users
  WHERE email = 'admin@orbitacms.local'
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
    'system.admin',
    'System',
    'Admin',
    'admin@orbitacms.local',
    '09999999999',
    'Admin@123',
    'Default admin user',
    GETDATE(),
    1,
    0,
    GETDATE(),
    GETDATE(),
    'SYSTEM',
    'SYSTEM'
  );
  PRINT 'Inserted user: admin@orbitacms.local';
END
ELSE
  PRINT 'User already exists: admin@orbitacms.local';
