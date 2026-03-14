ALTER TABLE workspaces ADD COLUMN is_paid INTEGER DEFAULT 0;
ALTER TABLE workspaces ADD COLUMN last_opened_at TEXT;