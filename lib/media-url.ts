const MAX_MEDIA_URL_LENGTH = 2048;

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || parts[0] >= 224) return true;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return parts[0] === 198 && (parts[1] === 18 || parts[1] === 19);
}

function isPrivateIpv6(hostname: string) {
  const address = hostname.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!address.includes(":")) return false;
  if (address === "::" || address === "::1") return true;
  const firstGroup = Number.parseInt(address.split(":")[0] || "0", 16);
  if ((firstGroup & 0xfe00) === 0xfc00 || (firstGroup & 0xffc0) === 0xfe80) return true;
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
  if (!mapped) return false;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
}

export function isPublicMediaUrl(value?: string) {
  const text = value?.trim();
  if (!text || text.length > MAX_MEDIA_URL_LENGTH) return false;
  try {
    const url = new URL(text);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
