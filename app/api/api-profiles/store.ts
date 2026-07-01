import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type ServerApiProfile = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  active: boolean;
  createdAt: number;
  updatedAt?: number;
};

export type PublicApiProfile = Omit<ServerApiProfile, "apiKey"> & { hasApiKey: boolean };

const PROFILE_DIR = path.join(process.cwd(), ".data");
const PROFILE_FILE = path.join(PROFILE_DIR, "api-profiles.json");

const defaultProfiles: ServerApiProfile[] = [
  { id: "fastgate-default", name: "默认 AIfastgate", baseUrl: "", apiKey: process.env.SEEDANCE_API_KEY || "", model: process.env.SEEDANCE_MODEL || "", active: false, createdAt: 0 },
  { id: "ark-v3-test", name: "Ark v3 测试平台", baseUrl: "http://43.159.135.17/api/v3", apiKey: process.env.ARK_V3_API_KEY || "", model: "doubao-seedance-2-0-fast-260128", active: true, createdAt: 1 }
];

export function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

export function toPublicProfile(profile: ServerApiProfile): PublicApiProfile {
  const { apiKey, ...rest } = profile;
  return { ...rest, hasApiKey: Boolean(apiKey) };
}

export function normalizeProfiles(profiles: ServerApiProfile[]) {
  const merged = [...defaultProfiles];
  profiles.forEach(profile => {
    const normalized = { ...profile, baseUrl: normalizeBaseUrl(profile.baseUrl), model: profile.model === "doubao-seedance-2.0-fast" ? "doubao-seedance-2-0-fast-260128" : profile.model };
    const sameIdIndex = merged.findIndex(item => item.id === normalized.id);
    if (sameIdIndex >= 0) merged[sameIdIndex] = { ...merged[sameIdIndex], ...normalized };
    else merged.push(normalized);
  });
  const deduped = merged.filter((profile, index, list) => {
    const key = `${profile.name.trim()}|${normalizeBaseUrl(profile.baseUrl)}|${profile.model.trim()}`;
    return index === list.findIndex(item => `${item.name.trim()}|${normalizeBaseUrl(item.baseUrl)}|${item.model.trim()}` === key);
  });
  const activeId = deduped.find(profile => profile.active && profile.id !== "fastgate-default")?.id || "ark-v3-test";
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
