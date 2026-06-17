-- 04_InsertImageType.sql
-- SQL Server seed script for image_type table.

IF NOT EXISTS (
  SELECT 1
  FROM dbo.image_type
  WHERE image_type_name = 'PROFILE'
)
BEGIN
  INSERT INTO dbo.image_type (
    id,
    image_type_name,
    is_deleted,
    created_date,
    updated_date,
    created_by,
    updated_by
  )
  VALUES (
    '33333333-3333-3333-3333-333333333333',
    'PROFILE',
    0,
    GETDATE(),
    GETDATE(),
    'SYSTEM',
    'SYSTEM'
  );
  PRINT 'Inserted image type: PROFILE';
END
ELSE
  PRINT 'Image type already exists: PROFILE';

IF NOT EXISTS (
  SELECT 1
  FROM dbo.image_type
  WHERE image_type_name = 'NRC'
)
BEGIN
  INSERT INTO dbo.image_type (
    id,
    image_type_name,
    is_deleted,
    created_date,
    updated_date,
    created_by,
    updated_by
  )
  VALUES (
    '33333333-3333-3333-3333-333333333334',
    'NRC',
    0,
    GETDATE(),
    GETDATE(),
    'SYSTEM',
    'SYSTEM'
  );
  PRINT 'Inserted image type: NRC';
END
ELSE
  PRINT 'Image type already exists: NRC';
