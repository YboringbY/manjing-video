import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type AuditActor = {
  tenantId?: string | null;
  userId?: string | null;
  user?: { account?: string | null; displayName?: string | null } | null;
};

type AuditOptions = {
  request?: Request;
  actor?: AuditActor | null;
  tenantId?: string | null;
  userId?: string | null;
  actorAccount?: string | null;
  action: string;
  targetType: string;
  targetId?: string | number | null;
  result?: "success" | "failure" | "blocked";
  metadata?: Record<string, unknown>;
};

const SECRET_KEY_PATTERN = /key|secret|token|password|credential|authorization/i;

function requestIp(request?: Request) {
  if (!request) return undefined;
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || forwardedFor || undefined;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return depth >= 3 ? "[array]" : value.slice(0, 20).map(item => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    if (depth >= 3) return "[object]";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).slice(0, 30).map(([key, item]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeValue(item, depth + 1)
      ])
    ) as Prisma.InputJsonObject;
  }
  return String(value);
}

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return undefined;
  return sanitizeValue(metadata) as Prisma.InputJsonObject;
}

export async function logAudit(options: AuditOptions) {
  try {
    const tenantId = options.tenantId ?? options.actor?.tenantId ?? undefined;
    const userId = options.userId ?? options.actor?.userId ?? undefined;
    const actorAccount = options.actorAccount ?? options.actor?.user?.account ?? options.actor?.user?.displayName ?? undefined;

    await prisma.auditLog.create({
      data: {
        tenantId: tenantId || undefined,
        userId: userId || undefined,
        actorAccount: actorAccount || undefined,
        action: options.action,
        targetType: options.targetType,
        targetId: options.targetId === undefined || options.targetId === null ? undefined : String(options.targetId),
        result: options.result || "success",
        ip: requestIp(options.request),
        userAgent: options.request?.headers.get("user-agent")?.slice(0, 500) || undefined,
        metadata: sanitizeMetadata(options.metadata)
      }
    });
  } catch (error) {
    console.warn("Audit log write failed", error);
  }
}
