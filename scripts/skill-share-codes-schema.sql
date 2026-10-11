-- Skill share codes. Knowing the 6-digit code is enough to redeem it.
-- There is no per-user owner in v1.
--
-- skill_identity is sha256(skill_name + "\n" + coalesce(skill_path, "")) so
-- minting the same skill name and path returns the existing code.
-- revoked_at is reserved for a later soft-delete. v1 does not write it.
-- A future revoke must also rewrite skill_identity (the unique key includes
-- revoked rows) before that skill can be minted again.
--
-- Applied automatically on API startup. You can also run this file yourself.

CREATE TABLE IF NOT EXISTS skill_share_codes (
  code CHAR(6) NOT NULL,
  skill_name VARCHAR(255) NOT NULL,
  skill_path TEXT NULL,
  workspace_path TEXT NULL,
  skill_title VARCHAR(255) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at TIMESTAMP(3) NULL,
  skill_identity CHAR(64) NOT NULL,
  PRIMARY KEY (code),
  UNIQUE KEY uq_skill_share_identity (skill_identity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
