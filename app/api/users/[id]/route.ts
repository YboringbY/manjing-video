import { MemberRole, MemberStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { publicUserFromMembership, requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const roles: MemberRole[] = ["admin", "user"];
const statuses: MemberStatus[] = ["active", "disabled"];

function normalizeRole(value: unknown): MemberRole | undefined {
  return roles.includes(value as MemberRole) ? value as MemberRole : undefined;
}

function normalizeStatus(value: unknown): MemberStatus | undefined {
  return statuses.includes(value as MemberStatus) ? value as MemberStatus : undefined;
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const userId = context.params.id;
    const membership = await prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId: auth.membership.tenantId, userId } },
      include: { tenant: true, user: true }
    });
    if (!membership) return NextResponse.json({ code: 404, message: "未找到成员。" }, { status: 404 });
    if (membership.userId === auth.membership.userId && normalizeStatus(body.status) === "disabled") {
      return NextResponse.json({ code: 400, message: "不能停用当前登录管理员。" }, { status: 400 });
    }

    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;
    const email = typeof body.email === "string" ? body.email.trim() : undefined;
    const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
    const password = typeof body.password === "string" ? body.password.trim() : "";
    const role = normalizeRole(body.role);
    const status = normalizeStatus(body.status);

    if (password && password.length < 8) return NextResponse.json({ code: 400, message: "新密码至少需要 8 位。" }, { status: 400 });

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

    return NextResponse.json({ code: 0, data: publicUserFromMembership(updated) });
  } catch (error) {
    return NextResponse.json({ code: 500, message: error instanceof Error ? error.message : "更新成员失败。" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const userId = context.params.id;
  if (userId === auth.membership.userId) return NextResponse.json({ code: 400, message: "不能停用当前登录管理员。" }, { status: 400 });

  const membership = await prisma.membership.update({
    where: { tenantId_userId: { tenantId: auth.membership.tenantId, userId } },
    data: { status: "disabled" },
    include: { tenant: true, user: true }
  }).catch(() => null);
  if (!membership) return NextResponse.json({ code: 404, message: "未找到成员。" }, { status: 404 });
  return NextResponse.json({ code: 0, data: publicUserFromMembership(membership) });
}
