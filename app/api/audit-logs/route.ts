import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const MAX_LIMIT = 200;

function cleanLimit(value: string | null) {
  const limit = Number(value || 80);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : 80;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const limited = rateLimit(request, { keyPrefix: `audit-logs:${auth.membership.userId}`, limit: 120, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action")?.trim();
  const actor = searchParams.get("actor")?.trim();
  const targetType = searchParams.get("targetType")?.trim();
  const result = searchParams.get("result")?.trim();
  const limit = cleanLimit(searchParams.get("limit"));

  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId: auth.membership.tenantId,
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
      ...(result ? { result } : {}),
      ...(actor ? { actorAccount: { contains: actor, mode: "insensitive" } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  return NextResponse.json({
    code: 0,
    data: logs.map(log => ({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      result: log.result,
      actorAccount: log.actorAccount,
      ip: log.ip,
      userAgent: log.userAgent,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString()
    }))
  });
}
