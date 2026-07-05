import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { MemberRole, MemberStatus } from "@prisma/client";
import { prisma } from "./prisma";

export const AUTH_COOKIE = "manjing_session";
export const DEFAULT_TENANT_SLUG = "default";

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

function sessionSecret() {
  return process.env.AUTH_SECRET || "local-dev-auth-secret-change-before-production";
}

function shouldUseSecureCookie() {
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

function signPayload(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function encodeSession(value: { userId: string; tenantId: string }) {
  const payload = Buffer.from(JSON.stringify({ ...value, nonce: randomBytes(8).toString("hex") })).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

function decodeSession(value?: string) {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(signPayload(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; tenantId?: string };
    return parsed.userId && parsed.tenantId ? { userId: parsed.userId, tenantId: parsed.tenantId } : null;
  } catch {
    return null;
  }
}

export async function setAuthSession(userId: string, tenantId: string) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, encodeSession({ userId, tenantId }), {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
}

export async function clearAuthSession() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE);
}

export function publicUserFromMembership(membership: {
  role: MemberRole;
  status: MemberStatus;
  tenant: { id: string; name: string; slug: string };
  user: { id: string; account: string; displayName: string; email: string | null; phone: string | null; createdAt: Date; updatedAt: Date };
}) {
  return {
    id: membership.user.id,
    account: membership.user.account,
    displayName: membership.user.displayName,
    email: membership.user.email || "",
    phone: membership.user.phone || "",
    role: membership.role,
    status: membership.status,
    createdAt: membership.user.createdAt.toISOString(),
    updatedAt: membership.user.updatedAt.toISOString(),
    tenant: membership.tenant
  };
}

export async function getCurrentMembership() {
  const cookieStore = await cookies();
  const session = decodeSession(cookieStore.get(AUTH_COOKIE)?.value);
  if (!session) return null;
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: session.tenantId, userId: session.userId } },
    include: { tenant: true, user: true }
  });
  if (!membership || membership.status !== "active") return null;
  return membership;
}

export async function requireAdmin() {
  const membership = await getCurrentMembership();
  if (!membership) return { error: Response.json({ code: 401, message: "请先登录。" }, { status: 401 }) };
  if (!["super_admin", "tenant_admin"].includes(membership.role)) {
    return { error: Response.json({ code: 403, message: "只有管理员可以执行此操作。" }, { status: 403 }) };
  }
  return { membership };
}

export function canAssignRole(operatorRole: MemberRole, targetRole: MemberRole) {
  if (operatorRole === "super_admin") return targetRole === "super_admin" || targetRole === "tenant_admin" || targetRole === "user";
  if (operatorRole === "tenant_admin") return targetRole === "user";
  return false;
}

export function canManageMember(operatorRole: MemberRole, targetRole: MemberRole) {
  if (operatorRole === "super_admin") return true;
  if (operatorRole === "tenant_admin") return targetRole === "user";
  return false;
}

export async function getDefaultTenant() {
  return prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: {},
    create: { name: "漫镜内部团队", slug: DEFAULT_TENANT_SLUG }
  });
}
