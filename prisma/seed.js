const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "default" },
    update: {},
    create: { name: "漫镜内部团队", slug: "default" }
  });

  const account = process.env.SEED_ADMIN_ACCOUNT || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD || "admin123456";

  const user = await prisma.user.upsert({
    where: { account },
    update: {},
    create: {
      account,
      displayName: "系统管理员",
      passwordHash: hashPassword(password)
    }
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    update: { role: "super_admin", status: "active" },
    create: { tenantId: tenant.id, userId: user.id, role: "super_admin" }
  });

  console.log(`Seeded tenant "${tenant.slug}" and admin account "${account}".`);
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
