import { unlink } from "fs/promises";
import path from "path";

const DEFAULT_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

function uploadRoot() {
  return path.resolve(process.env.ASSET_STORAGE_DIR || DEFAULT_UPLOAD_ROOT);
}

export function storedMaterialPathForUrl(value: string | undefined, projectId: number) {
  if (!value || !Number.isInteger(projectId) || projectId <= 0) return undefined;
  let pathname = "";
  try {
    pathname = new URL(value, "http://local.invalid").pathname;
  } catch {
    return undefined;
  }
  const prefix = `/uploads/projects/${projectId}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const segments = pathname.slice("/uploads/".length).split("/");
  if (segments.length !== 4) return undefined;
  const decoded = segments.map(segment => {
    try { return decodeURIComponent(segment); } catch { return ""; }
  });
  if (decoded.some(segment => !segment || segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) return undefined;
  const root = uploadRoot();
  const targetPath = path.resolve(root, ...decoded);
  return targetPath.startsWith(`${root}${path.sep}`) ? targetPath : undefined;
}

export async function removeStoredMaterialFile(storagePath?: string | null) {
  if (!storagePath) return false;
  const root = uploadRoot();
  const targetPath = path.resolve(storagePath);
  const relativeParts = path.relative(root, targetPath).split(path.sep);
  if (targetPath === root || !targetPath.startsWith(`${root}${path.sep}`) || relativeParts.length !== 4 || relativeParts[0] !== "projects") return false;
  try {
    await unlink(targetPath);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
