import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const baseUrl = (process.env.CORE_TEST_BASE_URL || "http://127.0.0.1:5050").replace(/\/$/, "");
const account = process.env.CORE_TEST_ACCOUNT || "";
const password = process.env.CORE_TEST_PASSWORD || "";
const parsedBaseUrl = new URL(baseUrl);

if (!account || !password) throw new Error("CORE_TEST_ACCOUNT and CORE_TEST_PASSWORD are required.");
if (![`localhost`, `127.0.0.1`, `::1`].includes(parsedBaseUrl.hostname)) {
  throw new Error("Core integration tests only run against a loopback host.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for test cleanup and task fixtures.");

const prisma = new PrismaClient();
const projectA = 1900000000 + Math.floor(Math.random() * 40000000);
const projectB = projectA + 1;
const shotId = BigInt(projectA) * BigInt(1000) + BigInt(1);
const taskId = `integration-${randomUUID()}`;
const imageTaskId = `image-integration-${randomUUID()}`;
let cookie = "";
let materialId = 0;
let uploadedMaterialId = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { response, body };
}

async function json(path, method, body) {
  return request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function createProject(id, name) {
  const created = await json("/api/projects", "POST", { id, name, type: "AI 漫剧", script: "" });
  assert(created.response.status === 200 && created.body.data?.version === 1, `Project ${id} creation failed.`);
  const workspace = await json("/api/workspaces", "POST", {
    projectId: id,
    name,
    state: { project: { id, name, type: "AI 漫剧", script: "", version: 1 } }
  });
  assert(workspace.response.status === 200, `Workspace ${id} creation failed.`);
}

try {
  const login = await json("/api/auth/login", "POST", { account, password });
  assert(login.response.status === 200 && login.body.code === 0, "Test login failed.");
  cookie = login.response.headers.get("set-cookie")?.split(";")[0] || "";
  assert(cookie, "Test login did not return a cookie.");

  const oversizedProject = await json("/api/projects", "POST", {
    id: 2147483648,
    name: "integration-invalid-id",
    type: "AI 漫剧",
    script: ""
  });
  assert(oversizedProject.response.status === 400, "Oversized database ID was not rejected.");

  await createProject(projectA, "integration-source");
  await createProject(projectB, "integration-target");

  const projectUpdate = await json("/api/projects", "PATCH", { id: projectA, version: 1, script: "integration script" });
  assert(projectUpdate.response.status === 200 && projectUpdate.body.data?.version === 2, "Project optimistic update failed.");
  const staleProject = await json("/api/projects", "PATCH", { id: projectA, version: 1, script: "stale" });
  assert(staleProject.response.status === 409, "Stale project update was not rejected.");

  const shotCreate = await json("/api/shots", "POST", {
    projectId: projectA,
    shot: { id: Number(shotId), title: "integration-shot", prompt: "test", ratio: "9:16 竖屏短剧", duration: 6 }
  });
  assert(shotCreate.response.status === 200 && shotCreate.body.data?.[0]?.version === 1, "Shot creation failed.");
  const shotUpdate = await json("/api/shots", "PATCH", { projectId: projectA, shotId: Number(shotId), version: 1, duration: 7 });
  assert(shotUpdate.response.status === 200 && shotUpdate.body.data?.version === 2, "Shot optimistic update failed.");
  const staleShot = await json("/api/shots", "PATCH", { projectId: projectA, shotId: Number(shotId), version: 1, duration: 8 });
  assert(staleShot.response.status === 409, "Stale shot update was not rejected.");

  const pngBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6wV0AAAAASUVORK5CYII=", "base64");
  function uploadForm(kind = "image") {
    const form = new FormData();
    form.append("file", new Blob([pngBytes], { type: "image/png" }), "integration-reference.png");
    form.append("projectId", String(projectA));
    form.append("kind", kind);
    return form;
  }
  const firstUpload = await request("/api/materials/upload", { method: "POST", body: uploadForm() });
  uploadedMaterialId = firstUpload.body.data?.id;
  assert(firstUpload.response.status === 200 && uploadedMaterialId && firstUpload.body.deduplicated === false, `Material upload failed: ${firstUpload.response.status} ${JSON.stringify(firstUpload.body)}`);
  await prisma.material.update({ where: { id: uploadedMaterialId }, data: { contentHash: null, byteSize: null, mimeType: null } });
  const duplicateUpload = await request("/api/materials/upload", { method: "POST", body: uploadForm() });
  assert(duplicateUpload.response.status === 200 && duplicateUpload.body.deduplicated === true && duplicateUpload.body.data?.id === uploadedMaterialId, "Legacy material upload was not hashed and reused.");
  const directDuplicateUpload = await request("/api/materials/upload", { method: "POST", body: uploadForm() });
  assert(directDuplicateUpload.response.status === 200 && directDuplicateUpload.body.deduplicated === true && directDuplicateUpload.body.data?.id === uploadedMaterialId, "Duplicate material upload was not reused.");
  const mismatchedUpload = await request("/api/materials/upload", { method: "POST", body: uploadForm("audio") });
  assert(mismatchedUpload.response.status === 400, "Mismatched upload content type was not rejected.");

  const materialCreate = await json("/api/materials", "POST", {
    projectId: projectA,
    name: "integration-shared-material",
    kind: "image",
    role: "reference_image",
    url: "https://example.com/integration.png",
    source: "link",
    status: "ready",
    scope: "team",
    sourceProjectId: projectA,
    sourceProjectName: "integration-source"
  });
  materialId = materialCreate.body.data?.id;
  assert(materialCreate.response.status === 200 && materialId, "Team material creation failed.");
  const unlinkedImageReference = await json("/api/images/generate", "POST", {
    projectId: projectB,
    referenceMaterialId: materialId,
    prompt: "integration reference image"
  });
  assert(unlinkedImageReference.response.status === 404, "Unlinked image reference was not rejected.");
  const unlinkedImageTask = await json("/api/image-tasks", "POST", {
    projectId: projectB,
    referenceMaterialId: materialId,
    prompt: "integration reference image",
    model: "integration-model",
    size: "1024x1024",
    n: 1
  });
  assert(unlinkedImageTask.response.status === 404, "Unlinked image task reference was not rejected.");
  const invalidImageTaskSize = await json("/api/image-tasks", "POST", {
    projectId: projectA,
    prompt: "integration invalid size",
    model: "integration-model",
    size: "invalid",
    n: 1
  });
  assert(invalidImageTaskSize.response.status === 400, "Invalid image task size was not rejected.");
  const unsupportedImageTaskPayload = {
    projectId: projectA,
    prompt: "integration unsupported model",
    model: `integration-unsupported-${randomUUID()}`,
    size: "1024x1024",
    n: 1
  };
  const concurrentImageTasks = await Promise.all([
    json("/api/image-tasks", "POST", unsupportedImageTaskPayload),
    json("/api/image-tasks", "POST", unsupportedImageTaskPayload)
  ]);
  const [unsupportedImageTask] = concurrentImageTasks.filter(result => result.response.status === 202);
  const [conflictingImageTask] = concurrentImageTasks.filter(result => result.response.status === 409);
  assert(unsupportedImageTask?.body.data?.id && conflictingImageTask?.body.data?.id === unsupportedImageTask.body.data.id, `Concurrent image task guard failed: ${concurrentImageTasks.map(result => result.response.status).join(",")}`);
  let failedImageTask;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    failedImageTask = await request(`/api/image-tasks?projectId=${projectA}&id=${unsupportedImageTask.body.data.id}`);
    if (failedImageTask.body.data?.status === "failed") break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(failedImageTask?.response.status === 200 && failedImageTask.body.data?.status === "failed" && failedImageTask.body.data?.error, "Asynchronous image task failure was not persisted.");
  const link = await json("/api/materials/links", "POST", { projectId: projectB, materialId });
  assert(link.response.status === 200, "Cross-project material link failed.");
  const targetMaterials = await request(`/api/materials?projectId=${projectB}`);
  assert(targetMaterials.body.data?.some(item => item.id === materialId), "Linked material is missing from target project.");
  const unlink = await request(`/api/materials/links?projectId=${projectB}&materialId=${materialId}`, { method: "DELETE" });
  assert(unlink.response.status === 200 && unlink.body.data?.unlinked, "Material unlink failed.");

  const membership = await prisma.membership.findFirst({
    where: { user: { account } },
    select: { tenantId: true, userId: true }
  });
  assert(membership, "Test membership was not found.");
  await prisma.imageTask.create({
    data: {
      id: imageTaskId,
      tenantId: membership.tenantId,
      projectId: projectA,
      status: "done",
      model: "integration-model",
      prompt: "integration image task",
      size: "1024x1024",
      imageCount: 1,
      resultMaterialIds: [uploadedMaterialId],
      createdById: membership.userId,
      createdByName: account,
      completedAt: new Date()
    }
  });
  const completedImageTask = await request(`/api/image-tasks?projectId=${projectA}&id=${imageTaskId}`);
  assert(completedImageTask.response.status === 200 && completedImageTask.body.data?.status === "done" && completedImageTask.body.data?.materials?.[0]?.id === uploadedMaterialId, `Completed image task result was not restored: ${completedImageTask.response.status} ${JSON.stringify(completedImageTask.body)}`);
  await prisma.videoTask.create({
    data: {
      id: taskId,
      tenantId: membership.tenantId,
      projectId: projectA,
      shotId,
      shotTitle: "integration-shot",
      provider: "integration",
      status: "done",
      result: "done",
      videoUrl: "https://example.com/integration.mp4",
      completedAt: new Date(),
      snapshot: { prompt: "test", ratio: "9:16", duration: 7, materialIds: [], externalAssetIds: [] }
    }
  });
  const asset = await prisma.videoAsset.create({
    data: {
      tenantId: membership.tenantId,
      projectId: projectA,
      shotId,
      title: "integration-asset",
      meta: "7秒 / 9:16",
      gradient: "none",
      videoUrl: "https://example.com/integration.mp4"
    }
  });
  const feedback = await json("/api/video-tasks/feedback", "PATCH", {
    projectId: projectA,
    taskId,
    rating: "satisfied",
    feedback: "integration"
  });
  assert(feedback.response.status === 200 && feedback.body.data?.rating === "satisfied", "Task feedback failed.");
  const assetDelete = await request(`/api/video-assets?projectId=${projectA}&assetId=${asset.id}`, { method: "DELETE" });
  assert(assetDelete.response.status === 200 && assetDelete.body.data?.deleted, "Video asset deletion failed.");
  const taskDelete = await request(`/api/video-tasks?project_id=${projectA}&task_id=${taskId}`, { method: "DELETE" });
  assert(taskDelete.response.status === 200 && taskDelete.body.data?.deleted, "Video task deletion failed.");

  console.log(JSON.stringify({ ok: true, strictDatabaseIds: true, projectOptimisticLock: true, shotOptimisticLock: true, materialUploadDeduplication: true, imageReferenceAuthorization: true, imageTaskLifecycle: true, materialLifecycle: true, taskAssetLifecycle: true }));
} finally {
  if (uploadedMaterialId) await request(`/api/materials?id=${uploadedMaterialId}`, { method: "DELETE" }).catch(() => undefined);
  if (materialId) await request(`/api/materials?id=${materialId}`, { method: "DELETE" }).catch(() => undefined);
  if (cookie) {
    await request(`/api/workspaces?projectId=${projectB}`, { method: "DELETE" }).catch(() => undefined);
    await request(`/api/workspaces?projectId=${projectA}`, { method: "DELETE" }).catch(() => undefined);
  }
  await prisma.videoAsset.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => undefined);
  await prisma.videoTask.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => undefined);
  await prisma.shot.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => undefined);
  await prisma.projectWorkspace.deleteMany({ where: { projectId: { in: [projectA, projectB] } } }).catch(() => undefined);
  await prisma.project.deleteMany({ where: { id: { in: [projectA, projectB] } } }).catch(() => undefined);
  await prisma.$disconnect();
}
