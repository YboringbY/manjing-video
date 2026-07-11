import { NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const MAX_DATABASE_INT = 2147483647;
const PROJECT_TYPES = new Set(["AI 漫剧", "AI 真人剧"]);

function cleanId(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_INT ? number : 0;
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

function publicProject(project: { id: number; name: string; type: string; script: string; status: string; version: number; createdAt: Date; updatedAt: Date }) {
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    script: project.script,
    status: project.status,
    version: project.version,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

export async function GET() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const projects = await prisma.project.findMany({
    where: { tenantId: membership.tenantId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, type: true, script: true, status: true, version: true, createdAt: true, updatedAt: true }
  });
  return NextResponse.json({ code: 0, data: projects.map(publicProject) });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const body = await request.json();
  const id = cleanId(body.id);
  const name = cleanText(body.name, "未命名项目");
  const type = cleanText(body.type, "AI 漫剧");
  if (!id) return NextResponse.json({ code: 400, message: "缺少有效的项目 ID。" }, { status: 400 });
  if (!PROJECT_TYPES.has(type)) return NextResponse.json({ code: 400, message: "项目类型不正确。" }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ code: 400, message: "项目名称最多 120 个字符。" }, { status: 400 });

  const existing = await prisma.project.findUnique({ where: { id } });
  if (existing) {
    if (existing.tenantId !== membership.tenantId) return NextResponse.json({ code: 409, message: "项目 ID 已被其他团队使用，请重新创建。" }, { status: 409 });
    return NextResponse.json({ code: 409, message: "项目已经存在，请刷新项目列表。", data: publicProject(existing) }, { status: 409 });
  }
  const project = await prisma.project.create({
    data: { id, tenantId: membership.tenantId, name, type, script: String(body.script || ""), createdById: membership.userId, updatedById: membership.userId }
  });
  await logAudit({ request, actor: membership, action: "project.create", targetType: "project", targetId: id, metadata: { name, type } });
  return NextResponse.json({ code: 0, data: publicProject(project) });
}

export async function PATCH(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const body = await request.json();
  const id = cleanId(body.id);
  const expectedVersion = Number(body.version);
  if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 1) return NextResponse.json({ code: 400, message: "缺少项目版本，请刷新后重试。" }, { status: 400 });
  const current = await prisma.project.findFirst({ where: { id, tenantId: membership.tenantId } });
  if (!current) return NextResponse.json({ code: 404, message: "项目不存在或已被删除。" }, { status: 404 });

  const name = body.name === undefined ? current.name : cleanText(body.name);
  const type = body.type === undefined ? current.type : cleanText(body.type);
  const script = body.script === undefined ? current.script : String(body.script);
  if (!name || name.length > 120 || !PROJECT_TYPES.has(type)) return NextResponse.json({ code: 400, message: "项目名称或类型不正确。" }, { status: 400 });
  const updated = await prisma.project.updateMany({
    where: { id, tenantId: membership.tenantId, version: expectedVersion },
    data: { name, type, script, updatedById: membership.userId, version: { increment: 1 } }
  });
  if (updated.count !== 1) {
    const latest = await prisma.project.findFirst({ where: { id, tenantId: membership.tenantId } });
    return NextResponse.json({ code: 409, message: "项目已被其他窗口更新，请刷新后再保存。", data: latest ? publicProject(latest) : undefined }, { status: 409 });
  }
  const project = await prisma.project.findUniqueOrThrow({ where: { id } });
  await logAudit({ request, actor: membership, action: "project.update", targetType: "project", targetId: id, metadata: { version: project.version, changedScript: script !== current.script, name } });
  return NextResponse.json({ code: 0, data: publicProject(project) });
}
