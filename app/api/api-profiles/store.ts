import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { chmod, mkdir, readFile } from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_TENANT_SLUG } from "@/lib/auth";

export type ServerApiProfile = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
  textModels?: string[];
  scriptModels?: string[];
  videoModels: string[];
  imageModels: string[];
  priority?: number;
  enabled?: boolean;
  concurrencyLimit?: number;
  active: boolean;
  createdAt: number;
  updatedAt?: number;
};

export type PublicApiProfile = Omit<ServerApiProfile, "apiKey"> & { hasApiKey: boolean };
export type ModelCapability = "text" | "image" | "video";

const PROFILE_DIR = path.join(process.cwd(), ".data");
const PROFILE_FILE = path.join(PROFILE_DIR, "api-profiles.json");
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ALLOWED_PROFILE_HOSTS = new Set(["api.aifastgate.com", "console.aifastgate.com", "gw.aifastgate.com", "43.159.135.17", "zjljzn.ltd", "api.openai.com"]);
const ALLOWED_PROFILE_HOST_SUFFIXES = [".openai.com", ".volces.com", ".zjljzn.ltd"];
const defaultProfiles: ServerApiProfile[] = [];

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

export function validateApiProfileBaseUrl(value: string) {
  try {
    const url = new URL(normalizeBaseUrl(value));
    const allowedProtocol = url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "43.159.135.17");
    const allowedHost = ALLOWED_PROFILE_HOSTS.has(url.hostname) || ALLOWED_PROFILE_HOST_SUFFIXES.some(suffix => url.hostname.endsWith(suffix));
    return allowedProtocol && allowedHost;
  } catch {
    return false;
  }
}

function normalizeModelId(value: string) {
  return value.trim() === "doubao-seedance-2.0-fast" ? "doubao-seedance-2-0-fast-260128" : value.trim();
}

function normalizeModelList(values?: string[] | string | Prisma.JsonValue | null, fallback?: string) {
  const list = Array.isArray(values) ? values : typeof values === "string" ? values.split(/\r?\n|,/) : [];
  const normalized = list.map(item => normalizeModelId(String(item))).filter(Boolean);
  const withFallback = fallback ? [normalizeModelId(fallback), ...normalized] : normalized;
  return Array.from(new Set(withFallback));
}

function encryptionSecret() {
  const secret = process.env.API_PROFILE_ENCRYPTION_KEY || process.env.AUTH_SECRET || "";
  if (!secret && process.env.NODE_ENV === "production") throw new Error("生产环境必须配置 API_PROFILE_ENCRYPTION_KEY 或 AUTH_SECRET 才能保存模型渠道。");
  return secret || "local-dev-api-profile-encryption-key";
}

function encryptionKey() {
  return createHash("sha256").update(encryptionSecret()).digest();
}

function encryptApiKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptApiKey(value: string) {
  if (!value) return "";
  const [version, ivText, tagText, encryptedText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) return value;
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

export function toPublicProfile(profile: ServerApiProfile): PublicApiProfile {
  const { apiKey, ...rest } = profile;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

function modelsForCapability(profile: ServerApiProfile, capability: ModelCapability) {
  if (capability === "text") return normalizeModelList(profile.textModels || profile.scriptModels);
  if (capability === "image") return normalizeModelList(profile.imageModels);
  return normalizeModelList(profile.videoModels, profile.model);
}

export function normalizeProfiles(profiles: ServerApiProfile[]) {
  const merged = [...defaultProfiles];
  profiles.forEach(profile => {
    const videoModels = normalizeModelList(profile.videoModels, profile.model);
    const textModels = normalizeModelList(profile.textModels || profile.scriptModels);
    const imageModels = normalizeModelList(profile.imageModels);
    const priority = Math.max(1, Math.min(999, Number(profile.priority || 100)));
    const concurrencyLimit = Math.max(1, Math.min(50, Number(profile.concurrencyLimit || 1)));
    const normalized = { ...profile, baseUrl: normalizeBaseUrl(profile.baseUrl), model: videoModels[0] || "", textModels, scriptModels: textModels, videoModels, imageModels, priority, enabled: profile.enabled ?? true, concurrencyLimit };
    const sameIdIndex = merged.findIndex(item => item.id === normalized.id);
    if (sameIdIndex >= 0) merged[sameIdIndex] = normalized;
    else merged.push(normalized);
  });
  const deduped = merged.filter((profile, index, list) => {
    const key = `${profile.name.trim()}|${normalizeBaseUrl(profile.baseUrl)}`;
    return index === list.findIndex(item => `${item.name.trim()}|${normalizeBaseUrl(item.baseUrl)}` === key);
  });
  const activeId = deduped.find(profile => profile.active)?.id || deduped[0]?.id || "";
  return deduped.map(profile => ({ ...profile, active: profile.id === activeId }));
}

async function defaultTenantId() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEFAULT_TENANT_SLUG },
    update: {},
    create: { name: "漫镜内部团队", slug: DEFAULT_TENANT_SLUG }
  });
  return tenant.id;
}

async function readLegacyFileProfiles() {
  try {
    await mkdir(PROFILE_DIR, { recursive: true, mode: 0o700 });
    await chmod(PROFILE_DIR, 0o700);
    await chmod(PROFILE_FILE, 0o600).catch(() => undefined);
    const text = await readFile(PROFILE_FILE, "utf8");
    return normalizeProfiles(JSON.parse(text) as ServerApiProfile[]);
  } catch {
    return [];
  }
}

function dbProfileToServer(profile: {
  id: string;
  name: string;
  baseUrl: string;
  encryptedApiKey: string;
  model: string | null;
  textModels: Prisma.JsonValue;
  scriptModels: Prisma.JsonValue | null;
  videoModels: Prisma.JsonValue;
  imageModels: Prisma.JsonValue;
  priority: number;
  enabled: boolean;
  concurrencyLimit: number;
  active: boolean;
  createdAtMillis: bigint | null;
  updatedAtMillis: bigint | null;
  createdAt: Date;
  updatedAt: Date;
}): ServerApiProfile {
  return {
    id: profile.id,
    name: profile.name,
    baseUrl: profile.baseUrl,
    apiKey: decryptApiKey(profile.encryptedApiKey),
    model: profile.model || undefined,
    textModels: normalizeModelList(profile.textModels),
    scriptModels: normalizeModelList(profile.scriptModels),
    videoModels: normalizeModelList(profile.videoModels, profile.model || undefined),
    imageModels: normalizeModelList(profile.imageModels),
    priority: profile.priority,
    enabled: profile.enabled,
    concurrencyLimit: profile.concurrencyLimit,
    active: profile.active,
    createdAt: Number(profile.createdAtMillis || BigInt(profile.createdAt.getTime())),
    updatedAt: Number(profile.updatedAtMillis || BigInt(profile.updatedAt.getTime()))
  };
}

async function upsertDbProfiles(profiles: ServerApiProfile[]) {
  const tenantId = await defaultTenantId();
  const normalized = normalizeProfiles(profiles);
  await prisma.$transaction(normalized.map(profile => prisma.apiProfile.upsert({
    where: { id: profile.id },
    update: {
      tenantId,
      name: profile.name,
      baseUrl: profile.baseUrl,
      encryptedApiKey: encryptApiKey(profile.apiKey),
      model: profile.model || null,
      textModels: profile.textModels || [],
      scriptModels: profile.scriptModels || profile.textModels || [],
      videoModels: profile.videoModels || [],
      imageModels: profile.imageModels || [],
      priority: profile.priority || 100,
      enabled: profile.enabled ?? true,
      concurrencyLimit: profile.concurrencyLimit || 1,
      active: profile.active,
      createdAtMillis: BigInt(profile.createdAt || Date.now()),
      updatedAtMillis: BigInt(profile.updatedAt || Date.now())
    },
    create: {
      id: profile.id,
      tenantId,
      name: profile.name,
      baseUrl: profile.baseUrl,
      encryptedApiKey: encryptApiKey(profile.apiKey),
      model: profile.model || null,
      textModels: profile.textModels || [],
      scriptModels: profile.scriptModels || profile.textModels || [],
      videoModels: profile.videoModels || [],
      imageModels: profile.imageModels || [],
      priority: profile.priority || 100,
      enabled: profile.enabled ?? true,
      concurrencyLimit: profile.concurrencyLimit || 1,
      active: profile.active,
      createdAtMillis: BigInt(profile.createdAt || Date.now()),
      updatedAtMillis: BigInt(profile.updatedAt || Date.now())
    }
  })));
}

async function migrateLegacyProfilesIfNeeded(tenantId: string) {
  const existingCount = await prisma.apiProfile.count({ where: { tenantId } });
  if (existingCount > 0) return;
  const legacyProfiles = await readLegacyFileProfiles();
  if (!legacyProfiles.length) return;
  await upsertDbProfiles(legacyProfiles);
}

export async function readServerApiProfiles() {
  const tenantId = await defaultTenantId();
  await migrateLegacyProfilesIfNeeded(tenantId);
  const profiles = await prisma.apiProfile.findMany({ where: { tenantId }, orderBy: [{ priority: "asc" }, { updatedAt: "asc" }] });
  return normalizeProfiles(profiles.map(dbProfileToServer));
}

export async function writeServerApiProfiles(profiles: ServerApiProfile[]) {
  const tenantId = await defaultTenantId();
  const normalized = normalizeProfiles(profiles);
  await upsertDbProfiles(normalized);
  const ids = normalized.map(profile => profile.id);
  await prisma.apiProfile.deleteMany({ where: { tenantId, id: { notIn: ids.length ? ids : [""] } } });
}

export async function findServerApiProfile(id?: string) {
  const profiles = await readServerApiProfiles();
  return profiles.find(profile => profile.id === id) || profiles.find(profile => profile.active) || profiles[0];
}

export async function listPublicModels(capability: ModelCapability) {
  const profiles = await readServerApiProfiles();
  const byModel = new Map<string, { modelId: string; displayName: string; routeCount: number; bestPriority: number }>();
  profiles.filter(profile => profile.enabled !== false).forEach(profile => {
    modelsForCapability(profile, capability).forEach(modelId => {
      const existing = byModel.get(modelId);
      const priority = profile.priority || 100;
      if (existing) byModel.set(modelId, { ...existing, routeCount: existing.routeCount + 1, bestPriority: Math.min(existing.bestPriority, priority) });
      else byModel.set(modelId, { modelId, displayName: modelId, routeCount: 1, bestPriority: priority });
    });
  });
  return Array.from(byModel.values()).sort((a, b) => a.bestPriority - b.bestPriority || a.displayName.localeCompare(b.displayName));
}

export async function resolveModelRoute(capability: ModelCapability, modelId?: string) {
  const profiles = await readServerApiProfiles();
  const enabledProfiles = profiles.filter(profile => profile.enabled !== false);
  const requestedModel = modelId?.trim();
  const candidates = enabledProfiles.filter(profile => validateApiProfileBaseUrl(profile.baseUrl)).flatMap(profile => {
    const models = modelsForCapability(profile, capability);
    return models.map(model => ({ profile, model }));
  }).filter(item => !requestedModel || item.model === requestedModel);
  const [selected] = candidates.sort((a, b) => (a.profile.priority || 100) - (b.profile.priority || 100) || (a.profile.updatedAt || 0) - (b.profile.updatedAt || 0));
  if (!selected) return undefined;
  return { profile: selected.profile, model: selected.model };
}
