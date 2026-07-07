import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

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

const PROFILE_DIR = path.join(process.cwd(), ".data");
const PROFILE_FILE = path.join(PROFILE_DIR, "api-profiles.json");

const defaultProfiles: ServerApiProfile[] = [];

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

function normalizeModelId(value: string) {
  return value.trim() === "doubao-seedance-2.0-fast" ? "doubao-seedance-2-0-fast-260128" : value.trim();
}

function normalizeModelList(values?: string[] | string, fallback?: string) {
  const list = Array.isArray(values) ? values : typeof values === "string" ? values.split(/\r?\n|,/) : [];
  const normalized = list.map(normalizeModelId).filter(Boolean);
  const withFallback = fallback ? [normalizeModelId(fallback), ...normalized] : normalized;
  return Array.from(new Set(withFallback));
}

export function toPublicProfile(profile: ServerApiProfile): PublicApiProfile {
  const { apiKey, ...rest } = profile;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

export type ModelCapability = "text" | "image" | "video";

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

export async function readServerApiProfiles() {
  try {
    const text = await readFile(PROFILE_FILE, "utf8");
    return normalizeProfiles(JSON.parse(text) as ServerApiProfile[]);
  } catch {
    return normalizeProfiles([]);
  }
}

export async function writeServerApiProfiles(profiles: ServerApiProfile[]) {
  await mkdir(PROFILE_DIR, { recursive: true });
  await writeFile(PROFILE_FILE, JSON.stringify(normalizeProfiles(profiles), null, 2));
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
  const candidates = enabledProfiles.flatMap(profile => {
    const models = modelsForCapability(profile, capability);
    return models.map(model => ({ profile, model }));
  }).filter(item => !requestedModel || item.model === requestedModel);
  const [selected] = candidates.sort((a, b) => (a.profile.priority || 100) - (b.profile.priority || 100) || (a.profile.updatedAt || 0) - (b.profile.updatedAt || 0));
  if (!selected) return undefined;
  return { profile: selected.profile, model: selected.model };
}
