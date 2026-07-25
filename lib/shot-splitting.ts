import type { Shot, ShotStatus } from "@/app/components/types";

type ShotPreset = Pick<Shot, "id" | "title" | "prompt" | "ratio" | "duration" | "status">;

export function estimatePromptDuration(text: string, fallback: number) {
  const durationMatch = text.match(/(?:总时长|时长|完整镜头)\D{0,6}(\d+)\s*(?:秒|s)/i) || text.match(/(\d+)\s*(?:秒|s)\s*(?:视频|镜头)/i);
  return durationMatch ? Number(durationMatch[1]) : fallback;
}

function splitPromptSentences(text: string) {
  return text
    .replace(/\n+/g, "。")
    .replace(/；/g, "。")
    .replace(/，然后/g, "。然后")
    .replace(/，接着/g, "。接着")
    .replace(/，随后/g, "。随后")
    .replace(/，同时/g, "。同时")
    .split(/[。.!?？]/)
    .map(item => item.trim())
    .filter(item => item.length > 6 && !/^(总时长|时长|风格|比例|格式)/.test(item));
}

function createEditedShot(index: number, total: number, action: string, totalDuration: number, segmentDuration: number, ratio: string, id: number): ShotPreset {
  const title = `镜头 ${String(index + 1).padStart(2, "0")}｜${action.slice(0, 14) || "分镜片段"}`;
  const prompt = [
    `专业短剧分镜 ${index + 1}/${total}，这是完整 ${totalDuration} 秒视频中的第 ${index + 1} 个镜头。`,
    `只生成本镜头内容，目标时长 ${segmentDuration} 秒，不要压缩完整剧情，不要生成其他镜头内容。`,
    `本镜头画面与动作：${action}。`,
    "台词要求：如果本镜头包含台词，只说本镜头台词，语速自然，保留停顿；如果没有台词则不要新增台词。",
    "剪辑要求：动作和台词必须完整表达本镜头，不要自由发挥新增人物、地点、情节或反转。",
    "画面风格：真人写实短剧质感，电影级布光，24帧，禁止字幕。"
  ].join("\n");
  return { id, title, prompt, ratio, duration: segmentDuration, status: "pending" as ShotStatus };
}

export function splitPromptIntoShots(text: string, options: { ratio: string; preferredDuration: number; now?: number }) {
  const content = text.trim();
  if (!content) return [];
  const totalDuration = estimatePromptDuration(content, options.preferredDuration);
  const now = options.now ?? Date.now();
  const timelineMatches = Array.from(content.matchAll(/(\d+)\s*[-~—至到]\s*(\d+)\s*秒[：:]\s*([^\n]+)/g));
  if (timelineMatches.length) {
    return timelineMatches.slice(0, 7).map((match, index, list) => {
      const start = Number(match[1]);
      const end = Number(match[2]);
      const action = match[3].trim().replace(/。$/, "");
      const duration = Math.max(3, end - start);
      return createEditedShot(index, list.length, action, Math.max(totalDuration, end), duration, options.ratio, now + index);
    });
  }

  const parts = splitPromptSentences(content);
  if (parts.length < 2) return [];
  const segmentCount = Math.min(7, Math.max(2, Math.round(totalDuration / 3) || Math.min(parts.length, 4)));
  const segmentDuration = Math.max(3, Math.round(totalDuration / segmentCount));
  const chunks = Array.from({ length: segmentCount }, (_, index) => {
    const start = Math.floor(index * parts.length / segmentCount);
    const end = Math.floor((index + 1) * parts.length / segmentCount);
    return parts.slice(start, Math.max(end, start + 1)).join("。") || parts[index % parts.length];
  });
  return chunks.map((action, index) => createEditedShot(index, chunks.length, action, totalDuration, segmentDuration, options.ratio, now + index));
}

export function buildShotDurationControlledPrompt(prompt: string, duration: number) {
  const cleanPrompt = prompt.trim();
  const durationText = `${duration}秒`;
  const alreadyControlled = cleanPrompt.includes("严格时长控制") || cleanPrompt.includes(`完整${durationText}`);
  if (alreadyControlled) return cleanPrompt;
  return [
    `严格时长控制：生成一个完整连续的 ${durationText} 视频。`,
    `完整画面和动作：${cleanPrompt}`,
    `多场景要求：如果提示词包含“场景1/2、场景2/2”或多个段落，请把它们理解为同一个 ${durationText} 视频内部的连续场景变化，不要拆成多个独立视频。`,
    `节奏要求：所有场景、动作、表情、镜头运动和停顿必须共同铺满 ${durationText}，不要提前结束，不要把每个场景单独压缩成 3 秒。`,
    "结构要求：只生成一个完整视频，禁止自动分割、禁止输出多个片段、禁止新增无关剧情或字幕。"
  ].join("\n");
}

export function createSinglePromptShot(text: string, duration: number, ratio: string, now = Date.now()): ShotPreset {
  const content = text.trim();
  return {
    id: now,
    title: `镜头 01｜完整${duration}秒镜头`,
    prompt: buildShotDurationControlledPrompt(content, duration),
    ratio,
    duration,
    status: "pending"
  };
}

export function prepareBatchShots(text: string, options: { ratio: string; selectedDuration: number; now?: number }) {
  const targetDuration = estimatePromptDuration(text, options.selectedDuration);
  const splitShots = splitPromptIntoShots(text, { ratio: options.ratio, preferredDuration: targetDuration, now: options.now });
  return splitShots.length ? splitShots : [createSinglePromptShot(text, options.selectedDuration, options.ratio, options.now)];
}
