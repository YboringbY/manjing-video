import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { databaseInt } from "@/lib/api-input";
import { getCurrentMembership } from "@/lib/auth";
import { isImageTaskActive, runImageTask } from "@/lib/image-task-runner";
import { publicMaterial } from "@/lib/material-response";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const MAX_PROMPT_LENGTH = 6000;
const STALE_RUNNING_TASK_MS = 15 * 60 * 1000;

function imageTaskMaterialIds(value: unknown) {
  return Array.isArray(value) ? value.map(Number).filter(id => Number.isInteger(id) && id > 0) : [];
}

async function publicImageTask(task: {
  id: string;
  tenantId: string;
  projectId: number;
  status: string;
  model: string;
  prompt: string;
  size: string;
  imageCount: number;
  referenceMaterialId: number | null;
  resultMaterialIds: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}) {
  const materialIds = imageTaskMaterialIds(task.resultMaterialIds);
  const materials = materialIds.length
    ? await prisma.material.findMany({
        where: { id: { in: materialIds }, tenantId: task.tenantId, projectLinks: { some: { tenantId: task.tenantId, projectId: task.projectId } } }
      })
    : [];
  const byId = new Map(materials.map(material => [material.id, material]));
  return {
    id: task.id,
    projectId: task.projectId,
    status: task.status,
    model: task.model,
    prompt: task.prompt,
    size: task.size,
    imageCount: task.imageCount,
    referenceMaterialId: task.referenceMaterialId || undefined,
    error: task.error || undefined,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    materials: materialIds.flatMap(id => byId.has(id) ? [publicMaterial(byId.get(id)!)] : [])
  };
}

export async function GET(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `image-tasks:read:${membership.userId}`, limit: 600, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const projectId = databaseInt(searchParams.get("projectId"));
  const id = searchParams.get("id")?.trim();
  if (!projectId) return NextResponse.json({ code: 400, message: "缺少有效的项目 ID。" }, { status: 400 });
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: membership.tenantId }, select: { id: true } });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在或已被删除。" }, { status: 404 });

  let task = id
    ? await prisma.imageTask.findUnique({ where: { tenantId_projectId_id: { tenantId: membership.tenantId, projectId, id } } })
    : await prisma.imageTask.findFirst({
        where: { tenantId: membership.tenantId, projectId, createdById: membership.userId, status: { in: ["pending", "running"] } },
        orderBy: { createdAt: "desc" }
      });
  if (!task) return id
    ? NextResponse.json({ code: 404, message: "生图任务不存在或已被删除。" }, { status: 404 })
    : NextResponse.json({ code: 0, data: null });

  const identity = { tenantId: task.tenantId, projectId: task.projectId, id: task.id };
  if (task.status === "pending") after(() => runImageTask(identity));
  if (task.status === "running" && !isImageTaskActive(identity) && Date.now() - task.updatedAt.getTime() > STALE_RUNNING_TASK_MS) {
    task = await prisma.imageTask.update({
      where: { tenantId_projectId_id: identity },
      data: { status: "failed", error: "生图服务在任务执行期间重启，未自动重复调用付费接口。请确认素材库后手动重试。", completedAt: new Date() }
    });
  }
  return NextResponse.json({ code: 0, data: await publicImageTask(task) });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `image-tasks:create:${membership.userId}`, limit: 120, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const body = await request.json();
  const projectId = databaseInt(body.projectId);
  const referenceMaterialId = databaseInt(body.referenceMaterialId);
  const prompt = String(body.prompt || "").trim();
  const model = String(body.model || "").trim();
  const size = String(body.size || "1024x1024").trim();
  const imageCount = Math.max(1, Math.min(10, Number(body.n || 1)));
  if (!projectId) return NextResponse.json({ code: 400, message: "缺少有效的项目 ID。" }, { status: 400 });
  if (!prompt) return NextResponse.json({ code: 400, message: "请先填写生图提示词。" }, { status: 400 });
  if (prompt.length > MAX_PROMPT_LENGTH) return NextResponse.json({ code: 400, message: `生图提示词最多 ${MAX_PROMPT_LENGTH} 字，请精简后再生成。` }, { status: 400 });
  const sizeMatch = /^(\d{3,4})x(\d{3,4})$/.exec(size);
  if (!sizeMatch || sizeMatch.slice(1).some(value => Number(value) < 256 || Number(value) > 4096)) {
    return NextResponse.json({ code: 400, message: "生图尺寸需在 256x256 到 4096x4096 之间。" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: membership.tenantId }, select: { id: true } });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在或已被删除。" }, { status: 404 });
  if (referenceMaterialId) {
    const reference = await prisma.projectMaterial.findFirst({
      where: { tenantId: membership.tenantId, projectId, materialId: referenceMaterialId },
      include: { material: { select: { kind: true } } }
    });
    if (!reference || reference.material.kind !== "image") {
      return NextResponse.json({ code: 404, message: "参考图不存在或不属于当前项目。" }, { status: 404 });
    }
  }

  const existing = await prisma.imageTask.findFirst({
    where: { tenantId: membership.tenantId, projectId, createdById: membership.userId, status: { in: ["pending", "running"] } },
    orderBy: { createdAt: "desc" }
  });
  if (existing) {
    return NextResponse.json({ code: 409, message: "当前项目已有生图任务正在处理。", data: await publicImageTask(existing) }, { status: 409 });
  }

  let task;
  try {
    task = await prisma.imageTask.create({
      data: {
        id: randomUUID(),
        tenantId: membership.tenantId,
        projectId,
        model,
        prompt,
        size,
        imageCount,
        referenceMaterialId,
        createdById: membership.userId,
        createdByName: membership.user.displayName
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const racedTask = await prisma.imageTask.findFirst({
        where: { tenantId: membership.tenantId, projectId, createdById: membership.userId, status: { in: ["pending", "running"] } },
        orderBy: { createdAt: "desc" }
      });
      if (racedTask) return NextResponse.json({ code: 409, message: "当前项目已有生图任务正在处理。", data: await publicImageTask(racedTask) }, { status: 409 });
    }
    throw error;
  }
  const identity = { tenantId: task.tenantId, projectId: task.projectId, id: task.id };
  after(() => runImageTask(identity));
  return NextResponse.json({ code: 0, data: await publicImageTask(task) }, { status: 202 });
}

export const maxDuration = 300;
