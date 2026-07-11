import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { removeStoredMaterialFile } from "@/lib/material-files";
import { prisma } from "@/lib/prisma";
import { publicVideoTask, safeNumberFromBigInt } from "@/lib/video-task";

const MAX_DATABASE_INT = 2147483647;

function cleanNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  if (Number.isInteger(number) && number > 0 && number <= MAX_DATABASE_INT) return number;
  if (Number.isFinite(number) && number > MAX_DATABASE_INT) return 1000000000 + (Math.abs(Math.trunc(number)) % 1000000000);
  return fallback;
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}

type WorkspaceRow = {
  projectId: number;
  name: string;
  state: unknown;
  updatedByName: string | null;
  updatedAt: Date;
};

type ProjectContentRow = Prisma.ProjectGetPayload<{
  include: {
    shots: true;
    videoTasks: true;
    videoAssets: true;
    _count: { select: { materialLinks: true } };
  };
}>;

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

function baseStateObject(state: unknown) {
  return state && typeof state === "object" ? state as Record<string, unknown> : {};
}

function hydrateWorkspace(workspace: WorkspaceRow, project?: ProjectContentRow) {
  if (!project) return publicWorkspace(workspace);
  const baseState = baseStateObject(workspace.state);
  const hydratedState = {
    ...baseState,
    project: {
      ...(baseState.project && typeof baseState.project === "object" ? baseState.project as Record<string, unknown> : {}),
      id: project.id,
      name: project.name,
      type: project.type,
      script: project.script,
      version: project.version,
      updatedAt: project.updatedAt.toISOString(),
      materialCount: project._count.materialLinks
    },
    shots: project.shots.map(shot => ({
      id: safeNumberFromBigInt(shot.id),
      title: shot.title,
      prompt: shot.prompt,
      ratio: shot.ratio,
      duration: shot.duration,
      status: shot.status,
      resolution: shot.resolution || undefined,
      width: shot.width || undefined,
      height: shot.height || undefined,
      version: shot.version,
      updatedAt: shot.updatedAt.toISOString()
    })),
    tasks: project.videoTasks.map(publicVideoTask),
    assets: project.videoAssets.map(asset => ({
      id: safeNumberFromBigInt(asset.id),
      shotId: safeNumberFromBigInt(asset.shotId),
      title: asset.title,
      meta: asset.meta,
      gradient: asset.gradient,
      videoUrl: asset.videoUrl || undefined,
      providerTaskId: asset.providerTaskId || undefined
    }))
  };
  return publicWorkspace({ ...workspace, name: project.name, state: hydratedState });
}

function workspaceForProject(project: ProjectContentRow): WorkspaceRow {
  return {
    projectId: project.id,
    name: project.name,
    state: { project: { id: project.id } },
    updatedByName: null,
    updatedAt: project.updatedAt
  };
}

function compatibilityState(state: unknown, projectId: number) {
  const base = baseStateObject(state);
  const project = base.project && typeof base.project === "object" ? base.project as Record<string, unknown> : {};
  return {
    ...base,
    project: { ...project, id: projectId },
    shots: [],
    tasks: [],
    assets: [],
    materials: []
  };
}

export async function GET() {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const [workspaces, projects] = await Promise.all([
    prisma.projectWorkspace.findMany({
      where: { tenantId: membership.tenantId },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.project.findMany({
      where: { tenantId: membership.tenantId },
      orderBy: { updatedAt: "desc" },
      include: {
        shots: { orderBy: [{ sortOrder: "asc" }, { updatedAt: "asc" }] },
        videoTasks: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
        videoAssets: { orderBy: { updatedAt: "desc" } },
        _count: { select: { materialLinks: true } }
      }
    })
  ]);
  const projectsById = new Map(projects.map(project => [project.id, project]));
  const workspacesByProjectId = new Map(workspaces.map(workspace => [workspace.projectId, workspace]));
  const rows = projects.map(project => workspacesByProjectId.get(project.id) || workspaceForProject(project));

  return NextResponse.json({ code: 0, data: rows.map(workspace => hydrateWorkspace(workspace, projectsById.get(workspace.projectId))) });
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });

  const body = await request.json();
  const projectId = cleanNumber(body.projectId, 0);
  const state = body.state && typeof body.state === "object" ? compatibilityState(body.state, projectId) : body.state;
  const name = cleanText(body.name || state?.project?.name, `项目 ${projectId}`);
  const lastUpdatedAt = cleanText(body.lastUpdatedAt);

  if (!projectId) return NextResponse.json({ code: 400, message: "缺少项目 ID。" }, { status: 400 });
  if (!state || typeof state !== "object") return NextResponse.json({ code: 400, message: "缺少项目工作区数据。" }, { status: 400 });

  const existing = await prisma.projectWorkspace.findUnique({
    where: { tenantId_projectId: { tenantId: membership.tenantId, projectId } }
  });
  const existingProject = await prisma.project.findUnique({ where: { id: projectId } });
  if (existingProject && existingProject.tenantId !== membership.tenantId) {
    return NextResponse.json({ code: 409, message: "项目 ID 已被其他团队使用，请重新创建项目。" }, { status: 409 });
  }
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
    if (!existingProject) return NextResponse.json({ code: 404, message: "项目尚未创建，请刷新后重试。" }, { status: 404 });
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

  const updateResult = await prisma.$transaction(async tx => {
    const updateResult = await tx.projectWorkspace.updateMany({
      where: { id: existing.id, updatedAt: existing.updatedAt },
      data: {
        name,
        state,
        updatedById: membership.userId,
        updatedByName: membership.user.displayName
      }
    });
    if (updateResult.count !== 1) return updateResult;

    return updateResult;
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
  const privateMaterials = await prisma.material.findMany({
    where: { tenantId: membership.tenantId, projectId, scope: "project" },
    select: { storagePath: true }
  });
  const deleted = await prisma.$transaction(async tx => {
    const shots = await tx.shot.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const videoTasks = await tx.videoTask.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const videoAssets = await tx.videoAsset.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const materialLinks = await tx.projectMaterial.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const materials = await tx.material.deleteMany({ where: { tenantId: membership.tenantId, projectId, scope: "project" } });
    const retainedTeamMaterials = await tx.material.updateMany({
      where: { tenantId: membership.tenantId, projectId, scope: "team" },
      data: { projectId: null, sourceProjectId: null }
    });
    const workspaces = await tx.projectWorkspace.deleteMany({ where: { tenantId: membership.tenantId, projectId } });
    const projects = await tx.project.deleteMany({ where: { tenantId: membership.tenantId, id: projectId } });
    return { shots, videoTasks, videoAssets, materialLinks, materials, retainedTeamMaterials, workspaces, projects };
  });
  let removedFiles = 0;
  const storagePaths = Array.from(new Set(privateMaterials.map(material => material.storagePath).filter((value): value is string => Boolean(value))));
  for (const storagePath of storagePaths) {
    const remainingReferences = await prisma.material.count({ where: { storagePath } });
    if (!remainingReferences && await removeStoredMaterialFile(storagePath).catch(() => false)) removedFiles += 1;
  }
  await logAudit({
    request,
    actor: membership,
    action: "project.delete",
    targetType: "project",
    targetId: projectId,
    metadata: { name: workspace?.name, deletedWorkspaces: deleted.workspaces.count, deletedMaterials: deleted.materials.count, removedMaterialLinks: deleted.materialLinks.count, retainedTeamMaterials: deleted.retainedTeamMaterials.count, removedFiles, deletedProjects: deleted.projects.count, deletedShots: deleted.shots.count, deletedVideoTasks: deleted.videoTasks.count, deletedVideoAssets: deleted.videoAssets.count }
  });
  return NextResponse.json({ code: 0 });
}
