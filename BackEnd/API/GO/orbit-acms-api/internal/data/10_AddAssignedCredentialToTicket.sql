-- 10_AddAssignedCredentialToTicket.sql
-- Alter Ticket table to add AssignedCredentialID reference to Credential table.

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Ticket]') 
      AND name = N'AssignedCredentialID'
)
BEGIN
    ALTER TABLE [dbo].[Ticket] 
    ADD [AssignedCredentialID] UNIQUEIDENTIFIER NULL;

    ALTER TABLE [dbo].[Ticket]
    ADD CONSTRAINT FK_Ticket_Credential FOREIGN KEY (AssignedCredentialID) REFERENCES [dbo].[Credential](ID);

    PRINT 'Added AssignedCredentialID column and constraint FK_Ticket_Credential to dbo.Ticket table.';
END
ELSE
BEGIN
    PRINT 'AssignedCredentialID column already exists in dbo.Ticket table.';
END
GO
