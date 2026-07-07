import { MemberRole, MemberStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { canAssignRole, canManageMember, publicUserFromMembership, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const roles: MemberRole[] = ["super_admin", "tenant_admin", "user"];
const statuses: MemberStatus[] = ["active", "disabled"];

function normalizeRole(value: unknown): MemberRole | undefined {
  return roles.includes(value as MemberRole) ? value as MemberRole : undefined;
}

function normalizeStatus(value: unknown): MemberStatus | undefined {
  return statuses.includes(value as MemberStatus) ? value as MemberStatus : undefined;
}

type UserRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: UserRouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const { id: userId } = await context.params;
    const membership = await prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: auth.membership.tenantId, userId } },
      include: { tenant: true, user: true }
    });
    if (!membership) return NextResponse.json({ code: 404, message: "未找到成员。" }, { status: 404 });
    if (!canManageMember(auth.membership.role, membership.role)) {
      await logAudit({ request, actor: auth.membership, action: "user.update", targetType: "user", targetId: userId, result: "blocked", metadata: { reason: "target_role_not_manageable", targetRole: membership.role } });
      return NextResponse.json({ code: 403, message: "当前角色不能修改这个成员。" }, { status: 403 });
    }
    if (membership.userId === auth.membership.userId && normalizeStatus(body.status) === "disabled") {
      await logAudit({ request, actor: auth.membership, action: "user.update", targetType: "user", targetId: userId, result: "blocked", metadata: { reason: "disable_self" } });
      return NextResponse.json({ code: 400, message: "不能停用当前登录管理员。" }, { status: 400 });
    }

    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const role = normalizeRole(body.role);
    const status = normalizeStatus(body.status);

    if (password && password.length < 8) return NextResponse.json({ code: 400, message: "新密码至少需要 8 位。" }, { status: 400 });
    if (role && !canAssignRole(auth.membership.role, role)) {
      await logAudit({ request, actor: auth.membership, action: "user.update", targetType: "user", targetId: userId, result: "blocked", metadata: { reason: "role_not_assignable", role } });
      return NextResponse.json({ code: 403, message: "当前角色不能分配这个成员权限。" }, { status: 403 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(displayName ? { displayName } : {}),
        ...(email !== undefined ? { email: email || null } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(password ? { passwordHash: hashPassword(password) } : {})
      }
    });

    const updated = await prisma.membership.update({
      where: { tenantId_userId: { tenantId: auth.membership.tenantId, userId } },
      data: {
        ...(role ? { role } : {}),
        ...(status ? { status } : {})
      },
      include: { tenant: true, user: true }
    });

    await logAudit({
      request,
      actor: auth.membership,
      action: "user.update",
      targetType: "user",
      targetId: userId,
      metadata: {
        account: updated.user.account,
        roleChanged: Boolean(role && role !== membership.role),
        statusChanged: Boolean(status && status !== membership.status),
        passwordChanged: Boolean(password),
        role: updated.role,
        status: updated.status
      }
    });

    return NextResponse.json({ code: 0, data: publicUserFromMembership(updated) });
  } catch (error) {
    const { id: userId } = await context.params;
    await logAudit({ request, actor: auth.membership, action: "user.update", targetType: "user", targetId: userId, result: "failure", metadata: { message: error instanceof Error ? error.message : "更新成员失败" } });
    return NextResponse.json({ code: 500, message: error instanceof Error ? error.message : "更新成员失败。" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: UserRouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { id: userId } = await context.params;
  if (userId === auth.membership.userId) {
    await logAudit({ request, actor: auth.membership, action: "user.disable", targetType: "user", targetId: userId, result: "blocked", metadata: { reason: "disable_self" } });
    return NextResponse.json({ code: 400, message: "不能停用当前登录管理员。" }, { status: 400 });
  }

  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: auth.membership.tenantId, userId } },
    include: { tenant: true, user: true }
  }).catch(() => null);
  if (!membership) return NextResponse.json({ code: 404, message: "未找到成员。" }, { status: 404 });
  if (!canManageMember(auth.membership.role, membership.role)) {
    await logAudit({ request, actor: auth.membership, action: "user.disable", targetType: "user", targetId: userId, result: "blocked", metadata: { reason: "target_role_not_manageable", targetRole: membership.role } });
    return NextResponse.json({ code: 403, message: "当前角色不能停用这个成员。" }, { status: 403 });
  }
  const updated = await prisma.membership.update({
    where: { tenantId_userId: { tenantId: auth.membership.tenantId, userId } },
    data: { status: "disabled" },
    include: { tenant: true, user: true }
  });
  await logAudit({ request, actor: auth.membership, action: "user.disable", targetType: "user", targetId: userId, metadata: { account: updated.user.account, role: updated.role } });
  return NextResponse.json({ code: 0, data: publicUserFromMembership(updated) });
}
