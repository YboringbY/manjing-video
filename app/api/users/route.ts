import { MemberRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { canAssignRole, canManageMember, getCurrentMembership, publicUserFromMembership, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const roles: MemberRole[] = ["super_admin", "tenant_admin", "user"];

function normalizeRole(value: unknown): MemberRole {
  return roles.includes(value as MemberRole) ? value as MemberRole : "user";
}

export async function GET() {
  const current = await getCurrentMembership();
  if (!current) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const users = await prisma.membership.findMany({
    where: { tenantId: current.tenantId },
    include: { tenant: true, user: true },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }]
  });
  return NextResponse.json({ code: 0, data: users.map(publicUserFromMembership) });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const account = String(body.account || "").trim();
    const displayName = String(body.displayName || "").trim() || account;
    const password = String(body.password || "").trim();
    const role = normalizeRole(body.role);
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();

    if (!account) return NextResponse.json({ code: 400, message: "请输入成员账号。" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ code: 400, message: "初始密码至少需要 8 位。" }, { status: 400 });
    if (!canAssignRole(auth.membership.role, role)) {
      await logAudit({ request, actor: auth.membership, action: "user.create", targetType: "user", targetId: account, result: "blocked", metadata: { reason: "role_not_assignable", role } });
      return NextResponse.json({ code: 403, message: "当前角色不能分配这个成员权限。" }, { status: 403 });
    }

    const existing = await prisma.user.findUnique({ where: { account } });
    const existingMembership = existing
      ? await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: auth.membership.tenantId, userId: existing.id } } })
      : null;
    if (existingMembership && !canManageMember(auth.membership.role, existingMembership.role)) {
      await logAudit({ request, actor: auth.membership, action: "user.update", targetType: "user", targetId: existing?.id || account, result: "blocked", metadata: { reason: "target_role_not_manageable", targetRole: existingMembership.role } });
      return NextResponse.json({ code: 403, message: "当前角色不能修改这个成员。" }, { status: 403 });
    }
    const wasExisting = Boolean(existing);
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { displayName, email: email || null, phone: phone || null } })
      : await prisma.user.create({ data: { account, displayName, passwordHash: hashPassword(password), email: email || null, phone: phone || null } });

    const membership = await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: auth.membership.tenantId, userId: user.id } },
      update: { role, status: "active" },
      create: { tenantId: auth.membership.tenantId, userId: user.id, role },
      include: { tenant: true, user: true }
    });

    await logAudit({
      request,
      actor: auth.membership,
      action: wasExisting ? "user.update" : "user.create",
      targetType: "user",
      targetId: user.id,
      metadata: { account, role, status: membership.status, updated: wasExisting }
    });

    return NextResponse.json({ code: 0, data: publicUserFromMembership(membership), updated: wasExisting });
  } catch (error) {
    await logAudit({ request, actor: auth.membership, action: "user.create", targetType: "user", result: "failure", metadata: { message: error instanceof Error ? error.message : "保存成员失败" } });
    return NextResponse.json({ code: 500, message: error instanceof Error ? error.message : "保存成员失败。" }, { status: 500 });
  }
}
