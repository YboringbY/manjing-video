import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultTenant, publicUserFromMembership, setAuthSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limited = rateLimit(request, { keyPrefix: "auth:login", limit: 10, windowMs: 60 * 1000 });
    if (limited) return limited;

    const body = await request.json();
    const account = String(body.account || "").trim();
    const password = String(body.password || "");
    if (!account || !password) return NextResponse.json({ code: 400, message: "请输入账号和密码。" }, { status: 400 });

    await getDefaultTenant();
    const user = await prisma.user.findUnique({ where: { account } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ code: 401, message: "账号或密码不正确。" }, { status: 401 });
    }

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, tenant: { slug: "default" }, status: "active" },
      include: { tenant: true, user: true }
    });
    if (!membership) return NextResponse.json({ code: 403, message: "账号已停用或未加入当前团队。" }, { status: 403 });

    await setAuthSession(user.id, membership.tenantId);
    return NextResponse.json({ code: 0, data: publicUserFromMembership(membership) });
  } catch (error) {
    return NextResponse.json({ code: 500, message: error instanceof Error ? error.message : "登录失败。" }, { status: 500 });
  }
}
