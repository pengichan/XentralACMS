-- 06_InsertUserImage.sql
-- SQL Server seed script for user_image table.

IF NOT EXISTS (
  SELECT 1
  FROM dbo.user_image
  WHERE user_id = '44444444-4444-4444-4444-444444444441'
    AND image_type_id = '33333333-3333-3333-3333-333333333333'
    AND image_name = 'profile-default.png'
)
BEGIN
  INSERT INTO dbo.user_image (
    id,
    user_id,
    image_type_id,
    image_name,
    stored_directory,
    is_deleted,
    uploaded_date,
    uploaded_by
  )
  VALUES (
    '66666666-6666-6666-6666-666666666661',
    '44444444-4444-4444-4444-444444444441',
    '33333333-3333-3333-3333-333333333333',
    'profile-default.png',
    '/uploads/users/44444444-4444-4444-4444-444444444441',
    0,
    GETDATE(),
    'SYSTEM'
  );
  PRINT 'Inserted user image: profile-default.png';
END
ELSE
  PRINT 'User image already exists: profile-default.png';
