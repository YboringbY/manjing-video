ALTER TYPE "MemberRole" RENAME TO "MemberRole_old";
CREATE TYPE "MemberRole" AS ENUM ('admin', 'user');

ALTER TABLE "Membership"
ALTER COLUMN "role" TYPE "MemberRole"
USING (
  CASE
    WHEN "role"::text = 'admin' THEN 'admin'
    ELSE 'user'
  END
)::"MemberRole";

DROP TYPE "MemberRole_old";
