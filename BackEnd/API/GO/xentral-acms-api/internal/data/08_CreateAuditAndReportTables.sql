-- 08_CreateAuditAndReportTables.sql

CREATE TABLE [dbo].[AuditLog] (
    [LogID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [Timestamp] DATETIME NOT NULL DEFAULT GETDATE(),
    [Actor] NVARCHAR(100) NOT NULL,
    [ActorRole] NVARCHAR(50) NOT NULL,
    [ActionType] NVARCHAR(100) NOT NULL,
    [TargetType] NVARCHAR(50) NOT NULL,
    [TargetName] NVARCHAR(200) NULL,
    [ServerName] NVARCHAR(100) NULL,
    [SourceIP] NVARCHAR(50) NULL,
    [Result] NVARCHAR(50) NOT NULL,
    [Severity] NVARCHAR(50) NOT NULL,
    [Details] NVARCHAR(MAX) NULL
);
GO

CREATE TABLE [dbo].[ReportsExportHistory] (
    [ExportID] UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    [ExportedBy] NVARCHAR(100) NOT NULL,
    [ExportType] NVARCHAR(50) NOT NULL,
    [ExportFormat] NVARCHAR(50) NOT NULL,
    [ExportTime] DATETIME NOT NULL DEFAULT GETDATE(),
    [Status] NVARCHAR(50) NOT NULL,
    [Details] NVARCHAR(500) NULL
);
GO
