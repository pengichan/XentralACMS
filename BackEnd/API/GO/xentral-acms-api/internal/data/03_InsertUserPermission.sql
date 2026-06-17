-- 03_InsertUserPermission.sql
-- SQL Server seed script for user_permission table.

IF NOT EXISTS (
  SELECT 1
  FROM dbo.user_permission
  WHERE user_role_id = '11111111-1111-1111-1111-111111111111'
    AND module_name = 'USER'
)
BEGIN
  INSERT INTO dbo.user_permission (
    id,
    user_role_id,
    module_name,
    can_create,
    can_read,
    can_update,
    can_delete,
    is_deleted,
    created_date,
    updated_date,
    created_by,
    updated_by
  )
  VALUES (
    '55555555-5555-5555-5555-555555555551',
    '11111111-1111-1111-1111-111111111111',
    'USER',
    1,
    1,
    1,
    1,
    0,
    GETDATE(),
    GETDATE(),
    'SYSTEM',
    'SYSTEM'
  );
  PRINT 'Inserted permission: ADMIN -> USER';
END
ELSE
  PRINT 'Permission already exists: ADMIN -> USER';

IF NOT EXISTS (
  SELECT 1
  FROM dbo.user_permission
  WHERE user_role_id = '22222222-2222-2222-2222-222222222222'
    AND module_name = 'USER'
)
BEGIN
  INSERT INTO dbo.user_permission (
    id,
    user_role_id,
    module_name,
    can_create,
    can_read,
    can_update,
    can_delete,
    is_deleted,
    created_date,
    updated_date,
    created_by,
    updated_by
  )
  VALUES (
    '55555555-5555-5555-5555-555555555552',
    '22222222-2222-2222-2222-222222222222',
    'USER',
    0,
    1,
    0,
    0,
    0,
    GETDATE(),
    GETDATE(),
    'SYSTEM',
    'SYSTEM'
  );
  PRINT 'Inserted permission: USER -> USER';
END
ELSE
  PRINT 'Permission already exists: USER -> USER';
