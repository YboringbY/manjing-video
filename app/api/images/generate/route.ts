import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { databaseInt } from "@/lib/api-input";
import { getCurrentMembership } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { fetchWithTimeout, readLimitedResponseBuffer } from "@/lib/http";
import { removeStoredMaterialFile, storedMaterialPathForUrl } from "@/lib/material-files";
import { isPublicMediaUrl } from "@/lib/media-url";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { resolveModelRoute } from "../../api-profiles/store";
import { appendProviderPath, normalizeProviderBaseUrl } from "@/lib/providers/video";

type ImageGeneratePayload = {
  model?: string;
  prompt?: string;
  size?: string;
  n?: number;
  projectId?: string | number;
  referenceMaterialId?: string | number;
};

type ProviderImage = {
  url?: string;
  b64_json?: string;
};

type ProviderResponse = {
  data?: ProviderImage[];
  images?: ProviderImage[];
  error?: { message?: string } | string;
  message?: string;
};

const DEFAULT_BASE_URL = process.env.IMAGE_API_BASE_URL || "https://api.openai.com";
const DEFAULT_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const MAX_IMAGE_PROMPT_LENGTH = 6000;
const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;
const PUBLIC_DIR = path.join(process.cwd(), "public");
const DEFAULT_UPLOAD_ROOT = path.join(PUBLIC_DIR, "uploads");
const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

function publicUrlFor(relativePath: string) {
  const baseUrl = process.env.ASSET_PUBLIC_BASE_URL || process.env.PUBLIC_ASSET_BASE_URL || "";
  if (!baseUrl) return relativePath;
  return `${baseUrl.replace(/\/$/, "")}${relativePath}`;
}

function extractError(result: ProviderResponse) {
  if (typeof result.error === "string") return result.error;
  return result.error?.message || result.message || "图片生成失败";
}

function imageMimeType(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.toString("ascii", 1, 4) === "PNG") return { mimeType: "image/png", extension: ".png" };
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { mimeType: "image/jpeg", extension: ".jpg" };
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return { mimeType: "image/webp", extension: ".webp" };
  return undefined;
}

async function loadReferenceImage(material: { id: number; url: string; previewUrl: string | null; reviewedAssetUrl: string | null; seedanceAssetUrl: string | null }, projectId: number) {
  const localPath = storedMaterialPathForUrl(material.previewUrl || material.url, projectId);
  let buffer: Buffer | undefined;
  if (localPath) {
    buffer = await readFile(localPath).catch(() => undefined);
    if (buffer && buffer.length > MAX_REMOTE_IMAGE_BYTES) throw new Error("参考图不能超过 25MB。");
  }
  if (!buffer) {
    const url = material.reviewedAssetUrl || material.seedanceAssetUrl || material.url;
    if (!isPublicMediaUrl(url)) throw new Error("参考图没有可安全读取的公网地址。");
    const response = await fetchWithTimeout(url, {}, 60000);
    if (!response.ok) throw new Error("读取参考图失败，请确认素材仍可访问。");
    buffer = await readLimitedResponseBuffer(response, MAX_REMOTE_IMAGE_BYTES);
  }
  const imageType = imageMimeType(buffer);
  if (!imageType) throw new Error("参考图仅支持 PNG、JPEG 或 WebP 格式。");
  return { buffer, ...imageType, filename: `reference-${material.id}${imageType.extension}` };
}

async function saveBase64Image(base64: string, projectId: string) {
  return saveImageBuffer(Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64"), projectId, ".png");
}

async function saveImageBuffer(buffer: Buffer, projectId: string, extension: string) {
  const uploadRoot = process.env.ASSET_STORAGE_DIR || DEFAULT_UPLOAD_ROOT;
  const targetDir = path.join(uploadRoot, "projects", projectId, "generated-images");
  const filename = `${Date.now()}-${randomUUID()}${extension}`;
  const storagePath = path.join(targetDir, filename);
  const relativePath = `/uploads/projects/${projectId}/generated-images/${filename}`;

  await mkdir(targetDir, { recursive: true });
  await writeFile(storagePath, buffer);

  return {
    previewUrl: relativePath,
    publicUrl: publicUrlFor(relativePath)
  };
}

async function saveRemoteImage(url: string, projectId: string) {
  const response = await fetchWithTimeout(url, {}, 60000);
  if (!response.ok) throw new Error("下载生成图片失败");
  const contentType = response.headers.get("content-type") || "image/png";
  const mimeType = contentType.split(";")[0];
  if (!mimeType.startsWith("image/")) throw new Error("生成图片地址返回的不是图片文件");
  const extension = IMAGE_EXTENSION_BY_TYPE[mimeType] || ".png";
  return saveImageBuffer(await readLimitedResponseBuffer(response, MAX_REMOTE_IMAGE_BYTES), projectId, extension);
}

export async function POST(request: Request) {
  const membership = await getCurrentMembership();
  if (!membership) return NextResponse.json({ code: 401, message: "请先登录。" }, { status: 401 });
  const limited = rateLimit(request, { keyPrefix: `images:generate:${membership.userId}`, limit: 120, windowMs: 10 * 60 * 1000 });
  if (limited) return limited;

  const body = await request.json() as ImageGeneratePayload;
  const prompt = body.prompt?.trim();
  const projectId = databaseInt(body.projectId);
  const referenceMaterialId = databaseInt(body.referenceMaterialId);

  if (!prompt) {
    return NextResponse.json({ code: 400, message: "请先填写生图提示词。" }, { status: 400 });
  }
  if (prompt.length > MAX_IMAGE_PROMPT_LENGTH) {
    return NextResponse.json({ code: 400, message: `生图提示词最多 ${MAX_IMAGE_PROMPT_LENGTH} 字，请精简后再生成。` }, { status: 400 });
  }
  if (!projectId) return NextResponse.json({ code: 400, message: "缺少有效的项目 ID。" }, { status: 400 });
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: membership.tenantId }, select: { id: true, name: true } });
  if (!project) return NextResponse.json({ code: 404, message: "项目不存在或已被删除。" }, { status: 404 });

  const referenceLink = referenceMaterialId
    ? await prisma.projectMaterial.findFirst({ where: { tenantId: membership.tenantId, projectId, materialId: referenceMaterialId }, include: { material: true } })
    : null;
  if (referenceMaterialId && (!referenceLink || referenceLink.material.kind !== "image")) {
    return NextResponse.json({ code: 404, message: "参考图不存在或不属于当前项目。" }, { status: 404 });
  }

  const route = await resolveModelRoute("image", body.model);
  if (body.model && !route) {
    return NextResponse.json({ code: 400, message: "当前没有启用的渠道支持所选生图模型，请在模型渠道管理中补充后重试。" }, { status: 400 });
  }
  const profile = route?.profile;

  const apiKey = profile?.apiKey || process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = normalizeProviderBaseUrl(profile?.baseUrl, DEFAULT_BASE_URL);
  const model = body.model || route?.model || DEFAULT_MODEL;

  if (!apiKey) {
    return NextResponse.json({ code: 500, message: "缺少图片生成访问凭证，请先在模型渠道中配置图片模型。" }, { status: 500 });
  }

  let response: Response;
  try {
    const imageCount = Math.max(1, Math.min(10, Number(body.n || 1)));
    if (referenceLink) {
      const reference = await loadReferenceImage(referenceLink.material, projectId);
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", body.size || "1024x1024");
      form.append("n", String(imageCount));
      form.append("image", new Blob([new Uint8Array(reference.buffer)], { type: reference.mimeType }), reference.filename);
      response = await fetchWithTimeout(appendProviderPath(baseUrl, "/v1/images/edits"), {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form
      }, 180000);
    } else {
      response = await fetchWithTimeout(appendProviderPath(baseUrl, "/v1/images/generations"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, size: body.size || "1024x1024", n: imageCount, response_format: "url" })
      }, 180000);
    }
  } catch (error) {
    await logAudit({ request, actor: membership, action: "image.generate", targetType: "image", targetId: String(projectId), result: "failure", metadata: { stage: "upstream_request", model, promptLength: prompt.length, referenceMaterialId: referenceMaterialId || undefined, message: error instanceof Error ? error.message : "生图上游请求失败" } });
    return NextResponse.json({ code: 504, message: error instanceof Error ? error.message : "生图上游请求失败。" }, { status: 504 });
  }

  const text = await response.text();
  let result: ProviderResponse = {};
  try { result = text ? JSON.parse(text) as ProviderResponse : {}; } catch { result = { message: text }; }

  if (!response.ok) {
    await logAudit({ request, actor: membership, action: "image.generate", targetType: "image", targetId: String(projectId), result: "failure", metadata: { stage: "upstream_response", status: response.status, model, promptLength: prompt.length, referenceMaterialId: referenceMaterialId || undefined, message: extractError(result) } });
    return NextResponse.json({ code: response.status, message: extractError(result), raw: result }, { status: response.status });
  }

  const items = result.data || result.images || [];
  let images: Array<({ name: string } & Awaited<ReturnType<typeof saveImageBuffer>>) | null> = [];
  try {
    images = await Promise.all(items.map(async (item, index) => {
      if (item.url) {
        const saved = await saveRemoteImage(item.url, String(projectId));
        return {
          name: `生图结果 ${index + 1}`,
          ...saved
        };
      }
      if (item.b64_json) {
        return {
          name: `生图结果 ${index + 1}`,
          ...(await saveBase64Image(item.b64_json, String(projectId)))
        };
      }
      return null;
    }));
  } catch (error) {
    await logAudit({ request, actor: membership, action: "image.generate", targetType: "image", targetId: String(projectId), result: "failure", metadata: { stage: "save_image", model, promptLength: prompt.length, referenceMaterialId: referenceMaterialId || undefined, message: error instanceof Error ? error.message : "保存生成图片失败" } });
    return NextResponse.json({ code: 502, message: error instanceof Error ? error.message : "保存生成图片失败。" }, { status: 502 });
  }

  const readyImages = images.filter((image): image is NonNullable<typeof image> => Boolean(image));
  if (!readyImages.length) {
    await logAudit({ request, actor: membership, action: "image.generate", targetType: "image", targetId: String(projectId), result: "failure", metadata: { stage: "empty_result", model, promptLength: prompt.length, referenceMaterialId: referenceMaterialId || undefined } });
    return NextResponse.json({ code: 400, message: "图片生成接口没有返回可用图片 URL。" }, { status: 400 });
  }

  const [width, height] = String(body.size || "1024x1024").split("x").map(Number);
  let savedMaterials;
  try {
    savedMaterials = await prisma.$transaction(readyImages.map((image, index) => prisma.material.create({
      data: {
        tenantId: membership.tenantId,
        projectId,
        name: image.name || `生图结果 ${index + 1}`,
        kind: "image",
        role: "reference_image",
        url: image.publicUrl,
        previewUrl: image.previewUrl,
        storagePath: storedMaterialPathForUrl(image.previewUrl, projectId),
        width: Number.isInteger(width) && width > 0 ? width : null,
        height: Number.isInteger(height) && height > 0 ? height : null,
        source: "generated",
        status: "ready",
        scope: "project",
        prompt,
        sourceProjectId: projectId,
        sourceProjectName: project.name,
        createdById: membership.userId,
        createdByName: membership.user.displayName,
        projectLinks: { create: { tenantId: membership.tenantId, projectId } }
      }
    })));
  } catch (error) {
    await Promise.all(readyImages.map(image => removeStoredMaterialFile(storedMaterialPathForUrl(image.previewUrl, projectId)).catch(() => false)));
    await logAudit({ request, actor: membership, action: "image.generate", targetType: "image", targetId: String(projectId), result: "failure", metadata: { stage: "persist_material", model, promptLength: prompt.length, referenceMaterialId: referenceMaterialId || undefined, message: error instanceof Error ? error.message : "保存生图素材记录失败" } });
    return NextResponse.json({ code: 500, message: "图片已经生成，但保存到素材库失败，请稍后重试。" }, { status: 500 });
  }

  await logAudit({
    request,
    actor: membership,
    action: "image.generate",
    targetType: "image",
    targetId: String(projectId),
    metadata: { model, size: body.size || "1024x1024", count: savedMaterials.length, promptLength: prompt.length, referenceMaterialId: referenceMaterialId || undefined, materialIds: savedMaterials.map(material => material.id) }
  });

  return NextResponse.json({
    code: 0,
    data: savedMaterials.map(material => ({
      id: material.id,
      dbId: material.id,
      name: material.name,
      kind: material.kind,
      role: material.role,
      url: material.url,
      previewUrl: material.previewUrl || undefined,
      width: material.width || undefined,
      height: material.height || undefined,
      source: material.source,
      status: material.status,
      scope: material.scope,
      prompt: material.prompt || undefined,
      sourceProjectId: material.sourceProjectId || undefined,
      sourceProjectName: material.sourceProjectName || undefined,
      createdBy: material.createdByName || undefined
    }))
  });
}
