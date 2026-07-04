ALTER TYPE "MemberRole" RENAME TO "MemberRole_old";
CREATE TYPE "MemberRole" AS ENUM ('super_admin', 'tenant_admin', 'user');

ALTER TABLE "Membership"
ALTER COLUMN "role" TYPE "MemberRole"
USING (
  CASE
    WHEN "role"::text = 'admin' THEN 'tenant_admin'
    ELSE 'user'
  END
)::"MemberRole";

DROP TYPE "MemberRole_old";
