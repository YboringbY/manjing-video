import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
  if (!state || typeof state !== "object") return NextResponse.json({ code: 400, message: "缺少项目工作区数据。" }, { status: 400 });

  const workspace = await prisma.projectWorkspace.upsert({
    where: { tenantId_projectId: { tenantId: membership.tenantId, projectId } },
    create: {
      tenantId: membership.tenantId,
      projectId,
      name,
      state,
      updatedById: membership.userId,
      updatedByName: membership.user.displayName
    },
    update: {
      name,
      state,
      updatedById: membership.userId,
      updatedByName: membership.user.displayName
    }
  });

  return NextResponse.json({ code: 0, data: publicWorkspace(workspace) });
}
