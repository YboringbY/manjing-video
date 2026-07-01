import { NextResponse } from "next/server";

type ScriptAction = "draft" | "optimize" | "outline";

type ScriptRequestBody = {
  action?: ScriptAction;
  theme?: string;
  characters?: string;
  style?: string;
  episodeCount?: number;
  script?: string;
  model?: string;
};

function getApiConfig() {
  return {
    apiKey: process.env.SCRIPT_AI_API_KEY || process.env.SEEDANCE_API_KEY,
    baseUrl: process.env.SCRIPT_AI_BASE_URL || process.env.SEEDANCE_BASE_URL || "https://api.aifastgate.com",
    model: process.env.SCRIPT_AI_MODEL || process.env.SEEDANCE_MODEL || "doubao-seedance-2.0"
  };
}

function buildPrompt(body: Required<Pick<ScriptRequestBody, "action">> & ScriptRequestBody) {
  const theme = (body.theme || "").trim();
  const characters = (body.characters || "").trim();
  const style = (body.style || "").trim() || "短剧风格";
  const script = (body.script || "").trim();
  const episodeCount = Math.max(Number(body.episodeCount || 6), 1);

  if (body.action === "draft") {
    return `你是专业短剧编剧。请根据以下信息生成一版可直接使用的中文短剧剧本初稿，输出必须包含【标题】【人物小传】【故事梗概】【分集大纲】【前3集详细剧情】【后续集数走向】【每集悬念点】这些部分，内容要有戏剧冲突、情绪推进和短剧节奏。\n\n【主题】${theme}\n【角色设定】${characters}\n【风格定位】${style}\n【集数规划】共 ${episodeCount} 集\n\n要求：\n1. 角色动机明确，人物关系清晰。\n2. 每集结尾必须有钩子。\n3. 语言自然、适合口播与分镜转化。\n4. 不要输出分析过程，只输出成品剧本。`;
  }

  if (body.action === "optimize") {
    return `你是专业短剧编剧，请优化下面的剧本，使对话更自然、冲突更集中、节奏更紧凑、人物动机更清晰。\n\n【风格定位】${style}\n【原剧本】\n${script}\n\n要求：\n1. 保留原剧情主线。\n2. 强化人物对话和情绪转折。\n3. 每一场戏都要有冲突推动。\n4. 输出优化后的完整版本，不要只给建议。`;
  }

  return `你是专业短剧编剧，请把下面剧本整理成【剧本大纲】与【单集拆分】，并给出清晰的分集规划，适合短剧拍摄和后续分镜。\n\n【主题】${theme || "待补充"}\n【角色设定】${characters || "待补充"}\n【风格定位】${style}\n【集数规划】共 ${episodeCount} 集\n【原剧本】\n${script || "（未提供完整剧本，请根据主题与角色进行整理）"}\n\n要求：\n1. 输出【整体大纲】【人物关系】【单集拆分】三部分。\n2. 单集拆分要按 ${episodeCount} 集输出。\n3. 每集要包含本集目标、冲突推进、结尾悬念。\n4. 不要输出分析过程，只输出整理结果。`;
}

async function callOpenAICompatible(prompt: string, model: string) {
  const { apiKey, baseUrl } = getApiConfig();
  if (!apiKey) {
    throw new Error("缺少 SCRIPT_AI_API_KEY 或 SEEDANCE_API_KEY，请先在 .env.local 中配置。");
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是专业短剧编剧，擅长输出结构清晰、适合拍摄的中文短剧内容。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 3500
    })
  });

  const text = await response.text();
  const result = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(result?.error?.message || result?.message || "AI 剧本生成失败");
  }

  const content = result?.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 返回内容为空");
  return content as string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ScriptRequestBody;
    const action = body.action;
    if (!action || !["draft", "optimize", "outline"].includes(action)) {
      return NextResponse.json({ code: 400, message: "缺少或无效的 action。" }, { status: 400 });
    }

    const model = body.model || getApiConfig().model;
    const prompt = buildPrompt({ ...body, action });
    const content = await callOpenAICompatible(prompt, model);

    return NextResponse.json({ code: 0, data: { content, model, action } });
  } catch (error) {
    return NextResponse.json(
      { code: 500, message: error instanceof Error ? error.message : "AI 剧本生成失败" },
      { status: 500 }
    );
  }
}
