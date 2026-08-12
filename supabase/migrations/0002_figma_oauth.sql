-- Figma OAuth connections: per-user access tokens (enterprise multi-tenant).
-- The PAT flow (single-account) stays as a fallback; OAuth lets ANY user
-- connect THEIR Figma account and audit THEIR files.
CREATE TABLE IF NOT EXISTS figma_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  figma_user_id text,
  figma_user_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE figma_connections ENABLE ROW LEVEL SECURITY;

-- Owner-only access
CREATE POLICY "figma_connections_owner_select" ON figma_connections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "figma_connections_owner_insert" ON figma_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "figma_connections_owner_update" ON figma_connections
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "figma_connections_owner_delete" ON figma_connections
  FOR DELETE USING (auth.uid() = user_id);
