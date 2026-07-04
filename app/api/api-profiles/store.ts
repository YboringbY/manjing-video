import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type ServerApiProfile = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model?: string;
  videoModels: string[];
  imageModels: string[];
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

export function normalizeProfiles(profiles: ServerApiProfile[]) {
  const merged = [...defaultProfiles];
  profiles.forEach(profile => {
    const videoModels = normalizeModelList(profile.videoModels, profile.model);
    const imageModels = normalizeModelList(profile.imageModels);
    const concurrencyLimit = Math.max(1, Math.min(50, Number(profile.concurrencyLimit || 1)));
    const normalized = { ...profile, baseUrl: normalizeBaseUrl(profile.baseUrl), model: videoModels[0] || "", videoModels, imageModels, concurrencyLimit };
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
