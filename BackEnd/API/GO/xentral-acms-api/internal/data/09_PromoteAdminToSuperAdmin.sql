-- 09_PromoteAdminToSuperAdmin.sql
-- Run this ONCE to promote your existing default admin account to Super Admin.
-- Replace 'admin' below with your actual user_id if different.

-- Step 1: Verify which user you want to promote (confirm before running Step 2)
SELECT
    CONVERT(VARCHAR(36), id) AS id,
    user_id,
    first_name,
    last_name,
    email,
    CONVERT(VARCHAR(36), user_role_id) AS current_role_id
FROM dbo.users
WHERE is_deleted = 0
ORDER BY created_date;

GO

-- Step 2: Promote the user to SUPER_ADMIN
-- The SUPER_ADMIN role ID is '00000000-0000-0000-0000-000000000001'
-- Change 'admin' to your actual user_id if needed.
UPDATE dbo.users
SET
    user_role_id = '00000000-0000-0000-0000-000000000001',
    updated_date = GETDATE()
WHERE user_id = 'admin'
  AND is_deleted = 0;

PRINT 'Promoted admin to SUPER_ADMIN role.';
PRINT 'Rows affected: ' + CAST(@@ROWCOUNT AS VARCHAR);

GO

-- Step 3: Verify the change
SELECT
    user_id,
    first_name,
    last_name,
    CONVERT(VARCHAR(36), user_role_id) AS role_id,
    ur.role_name
FROM dbo.users u
JOIN dbo.user_role ur ON ur.id = u.user_role_id
WHERE u.is_deleted = 0
ORDER BY u.created_date;
