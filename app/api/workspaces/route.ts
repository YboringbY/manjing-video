import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const MAX_DATABASE_INT = 2147483647;

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_INT ? number : fallback;
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function publicWorkspace(workspace: {
  projectId: number;
  name: string;
  state: unknown;
  updatedByName: string | null;
  updatedAt: Date;
}) {
  return {
    projectId: workspace.projectId,
    name: workspace.name,
    state: workspace.state,
    updatedBy: workspace.updatedByName || undefined,
    updatedAt: workspace.updatedAt.toISOString()
  };
}

export async function GET() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const workspaces = await prisma.projectWorkspace.findMany({
    where: { tenantId: membership.tenantId },
    orderBy: { updatedAt: "desc" }
  });

  return NextResponse.json({ code: 0, data: workspaces.map(publicWorkspace) });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const body = await request.json();
  const projectId = cleanNumber(body.projectId, 0);
  const state = body.state;
  const name = cleanText(body.name || state?.project?.name, `项目 ${projectId}`);
  const lastUpdatedAt = cleanText(body.lastUpdatedAt);

  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
  if (!state || typeof state !== "object") return NextResponse.json({ code: 400, message: "缺少项目工作区数据。" }, { status: 400 });

  const existing = await prisma.projectWorkspace.findUnique({
    where: { tenantId_projectId: { tenantId: membership.tenantId, projectId } }
  });
  if (existing && !lastUpdatedAt) {
    return NextResponse.json({
      code: 409,
      message: "项目工作区已存在，但本地缺少版本信息，请先刷新项目后再保存。",
      data: publicWorkspace(existing)
    }, { status: 409 });
  }
  if (existing && existing.updatedAt.toISOString() !== lastUpdatedAt) {
    return NextResponse.json({
      code: 409,
      message: "项目工作区已被其他窗口或成员更新，请先刷新项目后再保存。",
      data: publicWorkspace(existing)
    }, { status: 409 });
  }

  if (!existing) {
    const workspace = await prisma.projectWorkspace.create({
      data: {
        tenantId: membership.tenantId,
        projectId,
        name,
        state,
        updatedById: membership.userId,
        updatedByName: membership.user.displayName
      }
    });
    return NextResponse.json({ code: 0, data: publicWorkspace(workspace) });
  }

  const updateResult = await prisma.projectWorkspace.updateMany({
    where: { id: existing.id, updatedAt: existing.updatedAt },
    data: {
      name,
      state,
      updatedById: membership.userId,
      updatedByName: membership.user.displayName
    }
  });
  if (updateResult.count !== 1) {
    const latest = await prisma.projectWorkspace.findUnique({
      where: { tenantId_projectId: { tenantId: membership.tenantId, projectId } }
    });
    return NextResponse.json({
      code: 409,
      message: "项目工作区刚刚被其他请求更新，请刷新后再保存。",
      data: latest ? publicWorkspace(latest) : undefined
    }, { status: 409 });
  }

  const workspace = await prisma.projectWorkspace.findUniqueOrThrow({
    where: { id: existing.id }
  });

  return NextResponse.json({ code: 0, data: publicWorkspace(workspace) });
}

export async function DELETE(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = cleanNumber(searchParams.get("projectId"), 0);
  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });

  const workspace = await prisma.projectWorkspace.findUnique({
    where: { tenantId_projectId: { tenantId: membership.tenantId, projectId } }
  });
  const deleted = await prisma.projectWorkspace.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
  await logAudit({
    request,
    actor: membership,
    action: "project.delete",
    targetType: "project",
    targetId: projectId,
    metadata: { name: workspace?.name, deletedCount: deleted.count }
  });
  return NextResponse.json({ code: 0 });
}
