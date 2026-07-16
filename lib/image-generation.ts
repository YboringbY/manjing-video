import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { resolveModelRoute } from "@/app/api/api-profiles/store";
import { fetchWithTimeout, readLimitedResponseBuffer } from "@/lib/http";
import { removeStoredMaterialFile, storedMaterialPathForUrl } from "@/lib/material-files";
import { publicMaterial } from "@/lib/material-response";
import { isPublicMediaUrl } from "@/lib/media-url";
import { prisma } from "@/lib/prisma";
import { appendProviderPath, normalizeProviderBaseUrl } from "@/lib/providers/video";

export type ImageGenerationInput = {
  model?: string;
  prompt: string;
  size: string;
  n: number;
  projectId: number;
  referenceMaterialId?: number;
};

export type ImageGenerationActor = {
  tenantId: string;
  userId?: string;
  displayName: string;
};

type ProviderImage = { url?: string; b64_json?: string };
type ProviderResponse = {
  data?: ProviderImage[];
  images?: ProviderImage[];
  error?: { message?: string } | string;
  message?: string;
};

export class ImageGenerationError extends Error {
  constructor(public status: number, message: string, public stage: string, public raw?: unknown) {
    super(message);
    this.name = "ImageGenerationError";
  }
}

const DEFAULT_BASE_URL = process.env.IMAGE_API_BASE_URL || "https://api.openai.com";
const DEFAULT_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";
const MAX_IMAGE_PROMPT_LENGTH = 6000;
const MAX_REMOTE_IMAGE_BYTES = 25 * 1024 * 1024;
const DEFAULT_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const IMAGE_EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

function publicUrlFor(relativePath: string) {
  const baseUrl = process.env.ASSET_PUBLIC_BASE_URL || process.env.PUBLIC_ASSET_BASE_URL || "";
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${relativePath}` : relativePath;
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
    if (buffer && buffer.length > MAX_REMOTE_IMAGE_BYTES) throw new ImageGenerationError(400, "参考图不能超过 25MB。", "reference_image");
  }
  if (!buffer) {
    const url = material.reviewedAssetUrl || material.seedanceAssetUrl || material.url;
    if (!isPublicMediaUrl(url)) throw new ImageGenerationError(400, "参考图没有可安全读取的公网地址。", "reference_image");
    const response = await fetchWithTimeout(url, {}, 60000);
    if (!response.ok) throw new ImageGenerationError(502, "读取参考图失败，请确认素材仍可访问。", "reference_image");
    buffer = await readLimitedResponseBuffer(response, MAX_REMOTE_IMAGE_BYTES);
  }
  const imageType = imageMimeType(buffer);
  if (!imageType) throw new ImageGenerationError(400, "参考图仅支持 PNG、JPEG 或 WebP 格式。", "reference_image");
  return { buffer, ...imageType, filename: `reference-${material.id}${imageType.extension}` };
}

async function saveImageBuffer(buffer: Buffer, projectId: number, extension: string) {
  const uploadRoot = process.env.ASSET_STORAGE_DIR || DEFAULT_UPLOAD_ROOT;
  const targetDir = path.join(uploadRoot, "projects", String(projectId), "generated-images");
  const filename = `${Date.now()}-${randomUUID()}${extension}`;
  const storagePath = path.join(targetDir, filename);
  const relativePath = `/uploads/projects/${projectId}/generated-images/${filename}`;
  await mkdir(targetDir, { recursive: true });
  try {
    await writeFile(storagePath, buffer);
  } catch (error) {
    await unlink(storagePath).catch(() => undefined);
    throw error;
  }
  return { previewUrl: relativePath, publicUrl: publicUrlFor(relativePath) };
}

async function saveBase64Image(base64: string, projectId: number) {
  const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), "base64");
  if (buffer.length > MAX_REMOTE_IMAGE_BYTES) throw new Error("生成图片超过 25MB。");
  const imageType = imageMimeType(buffer);
  if (!imageType) throw new Error("生成接口返回了无效的图片内容。");
  return saveImageBuffer(buffer, projectId, imageType.extension);
}

async function saveRemoteImage(url: string, projectId: number) {
  const response = await fetchWithTimeout(url, {}, 60000);
  if (!response.ok) throw new Error("下载生成图片失败。");
  const contentType = (response.headers.get("content-type") || "image/png").split(";")[0];
  if (!contentType.startsWith("image/")) throw new Error("生成图片地址返回的不是图片文件。");
  const buffer = await readLimitedResponseBuffer(response, MAX_REMOTE_IMAGE_BYTES);
  const detected = imageMimeType(buffer);
  if (!detected) throw new Error("生成图片地址返回了无效的图片内容。");
  const extension = IMAGE_EXTENSION_BY_TYPE[contentType] || detected.extension;
  return saveImageBuffer(buffer, projectId, extension);
}

function normalizeInput(input: ImageGenerationInput) {
  const prompt = input.prompt.trim();
  if (!prompt) throw new ImageGenerationError(400, "请先填写生图提示词。", "validation");
  if (prompt.length > MAX_IMAGE_PROMPT_LENGTH) throw new ImageGenerationError(400, `生图提示词最多 ${MAX_IMAGE_PROMPT_LENGTH} 字，请精简后再生成。`, "validation");
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) throw new ImageGenerationError(400, "缺少有效的项目 ID。", "validation");
  const sizeMatch = /^(\d{3,4})x(\d{3,4})$/.exec(input.size);
  if (!sizeMatch || sizeMatch.slice(1).some(value => Number(value) < 256 || Number(value) > 4096)) {
    throw new ImageGenerationError(400, "生图尺寸需在 256x256 到 4096x4096 之间。", "validation");
  }
  return { ...input, prompt, size: input.size, n: Math.max(1, Math.min(10, Number(input.n || 1))) };
}

export async function generateAndPersistImages(actor: ImageGenerationActor, rawInput: ImageGenerationInput) {
  const input = normalizeInput(rawInput);
  const project = await prisma.project.findFirst({ where: { id: input.projectId, tenantId: actor.tenantId }, select: { id: true, name: true } });
  if (!project) throw new ImageGenerationError(404, "项目不存在或已被删除。", "validation");

  const referenceLink = input.referenceMaterialId
    ? await prisma.projectMaterial.findFirst({ where: { tenantId: actor.tenantId, projectId: input.projectId, materialId: input.referenceMaterialId }, include: { material: true } })
    : null;
  if (input.referenceMaterialId && (!referenceLink || referenceLink.material.kind !== "image")) {
    throw new ImageGenerationError(404, "参考图不存在或不属于当前项目。", "validation");
  }

  const route = await resolveModelRoute("image", input.model);
  if (input.model && !route) throw new ImageGenerationError(400, "当前没有启用的渠道支持所选生图模型，请在模型渠道管理中补充后重试。", "validation");
  const profile = route?.profile;
  const apiKey = profile?.apiKey || process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = normalizeProviderBaseUrl(profile?.baseUrl, DEFAULT_BASE_URL);
  const model = input.model || route?.model || DEFAULT_MODEL;
  if (!apiKey) throw new ImageGenerationError(500, "缺少图片生成访问凭证，请先在模型渠道中配置图片模型。", "configuration");

  let response: Response;
  try {
    if (referenceLink) {
      const reference = await loadReferenceImage(referenceLink.material, input.projectId);
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", input.prompt);
      form.append("size", input.size);
      form.append("n", String(input.n));
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
        body: JSON.stringify({ model, prompt: input.prompt, size: input.size, n: input.n, response_format: "url" })
      }, 180000);
    }
  } catch (error) {
    if (error instanceof ImageGenerationError) throw error;
    throw new ImageGenerationError(504, error instanceof Error ? error.message : "生图上游请求失败。", "upstream_request");
  }

  const text = await response.text();
  let result: ProviderResponse = {};
  try { result = text ? JSON.parse(text) as ProviderResponse : {}; } catch { result = { message: text }; }
  if (!response.ok) throw new ImageGenerationError(response.status, extractError(result), "upstream_response", result);

  const items = result.data || result.images || [];
  const settledImages = await Promise.allSettled(items.map(async (item, index) => {
    const saved = item.url
      ? await saveRemoteImage(item.url, input.projectId)
      : item.b64_json
        ? await saveBase64Image(item.b64_json, input.projectId)
        : null;
    return saved ? { name: `生图结果 ${index + 1}`, ...saved } : null;
  }));
  const readyImages = settledImages.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
  const failedImage = settledImages.find(result => result.status === "rejected");
  if (failedImage?.status === "rejected") {
    await Promise.all(readyImages.map(image => removeStoredMaterialFile(storedMaterialPathForUrl(image.previewUrl, input.projectId)).catch(() => false)));
    throw new ImageGenerationError(502, failedImage.reason instanceof Error ? failedImage.reason.message : "保存生成图片失败。", "save_image");
  }
  readyImages.sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
  if (!readyImages.length) throw new ImageGenerationError(400, "图片生成接口没有返回可用图片。", "empty_result");

  const [width, height] = input.size.split("x").map(Number);
  try {
    const materials = await prisma.$transaction(readyImages.map(image => prisma.material.create({
      data: {
        tenantId: actor.tenantId,
        projectId: input.projectId,
        name: image.name,
        kind: "image",
        role: "reference_image",
        url: image.publicUrl,
        previewUrl: image.previewUrl,
        storagePath: storedMaterialPathForUrl(image.previewUrl, input.projectId),
        width,
        height,
        source: "generated",
        status: "ready",
        scope: "project",
        prompt: input.prompt,
        sourceProjectId: input.projectId,
        sourceProjectName: project.name,
        createdById: actor.userId || undefined,
        createdByName: actor.displayName,
        projectLinks: { create: { tenantId: actor.tenantId, projectId: input.projectId } }
      }
    })));
    return { materials: materials.map(publicMaterial), model, prompt: input.prompt, size: input.size, referenceMaterialId: input.referenceMaterialId };
  } catch {
    await Promise.all(readyImages.map(image => removeStoredMaterialFile(storedMaterialPathForUrl(image.previewUrl, input.projectId)).catch(() => false)));
    throw new ImageGenerationError(500, "图片已经生成，但保存到素材库失败，请稍后重试。", "persist_material");
  }
}
