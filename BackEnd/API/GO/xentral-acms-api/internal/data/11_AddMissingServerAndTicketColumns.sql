-- 11_AddMissingServerAndTicketColumns.sql
-- Alter Server and Ticket tables to add missing design spec columns.

-- 1. Alter dbo.Server
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Server]') AND name = N'Environment')
BEGIN
    ALTER TABLE [dbo].[Server] ADD [Environment] NVARCHAR(100) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Server]') AND name = N'Location')
BEGIN
    ALTER TABLE [dbo].[Server] ADD [Location] NVARCHAR(100) NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Server]') AND name = N'RemoteProtocol')
BEGIN
    ALTER TABLE [dbo].[Server] ADD [RemoteProtocol] NVARCHAR(50) NOT NULL DEFAULT 'RDP';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Server]') AND name = N'ServerStatus')
BEGIN
    ALTER TABLE [dbo].[Server] ADD [ServerStatus] NVARCHAR(50) NOT NULL DEFAULT 'Active';
END

PRINT 'Completed altering dbo.Server table.';
GO

-- 2. Alter dbo.Ticket
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Ticket]') AND name = N'RequestedStartTime')
BEGIN
    ALTER TABLE [dbo].[Ticket] ADD [RequestedStartTime] DATETIME NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Ticket]') AND name = N'RequestedEndTime')
BEGIN
    ALTER TABLE [dbo].[Ticket] ADD [RequestedEndTime] DATETIME NULL;
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Ticket]') AND name = N'AccessType')
BEGIN
    ALTER TABLE [dbo].[Ticket] ADD [AccessType] NVARCHAR(100) NOT NULL DEFAULT 'Remote Access';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Ticket]') AND name = N'Urgency')
BEGIN
    ALTER TABLE [dbo].[Ticket] ADD [Urgency] NVARCHAR(50) NOT NULL DEFAULT 'Normal';
END

PRINT 'Completed altering dbo.Ticket table.';
GO
