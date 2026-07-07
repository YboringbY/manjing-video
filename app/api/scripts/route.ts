import { NextResponse } from "next/server";
import { resolveModelRoute } from "../api-profiles/store";

type ScriptAction = "draft" | "optimize" | "outline";

type ScriptRequestBody = {
  action?: ScriptAction;
  theme?: string;
  characters?: string;
  episodeCount?: number | string;
  script?: string;
  model?: string;
};

function getEnvApiConfig() {
  return {
    apiKey: process.env.SCRIPT_AI_API_KEY || process.env.SEEDANCE_API_KEY,
    baseUrl: process.env.SCRIPT_AI_BASE_URL || process.env.SEEDANCE_BASE_URL || "https://api.aifastgate.com",
    model: process.env.SCRIPT_AI_MODEL || process.env.SEEDANCE_MODEL || "doubao-seedance-2.0"
  };
}

function buildPrompt(body: Required<Pick<ScriptRequestBody, "action">> & ScriptRequestBody) {
  const theme = (body.theme || "").trim();
  const characters = (body.characters || "").trim();
  const script = (body.script || "").trim();
  const episodeCount = Number(body.episodeCount || 0);
  const episodeLine = Number.isFinite(episodeCount) && episodeCount > 0 ? `\n【目标集数】共 ${episodeCount} 集` : "";

  if (body.action === "draft") {
    return `你是专业短剧编剧。请根据以下信息生成一版可继续编辑的中文短剧剧本初稿，输出必须包含【标题】【人物小传】【故事梗概】【分集大纲】【前3集详细剧情】【后续集数走向】【每集悬念点】这些部分，内容要有戏剧冲突、情绪推进和短剧节奏。\n\n【故事想法】${theme}\n【主要人物】${characters || "未指定，请根据故事想法自行设计主要人物"}${episodeLine}\n\n要求：\n1. 角色动机明确，人物关系清晰。\n2. 每集结尾必须有钩子。\n3. 语言自然、适合口播与分镜转化。\n4. 不要输出分析过程，只输出成品剧本。`;
  }

  if (body.action === "optimize") {
    return `你是专业短剧编剧，请优化下面的剧本，使对话更自然、冲突更集中、节奏更紧凑、人物动机更清晰。\n\n【原剧本】\n${script}\n\n要求：\n1. 保留原剧情主线。\n2. 强化人物对话和情绪转折。\n3. 每一场戏都要有冲突推动。\n4. 输出优化后的完整版本，不要只给建议。`;
  }

  return `你是专业短剧编剧，请把下面剧本整理成【剧本大纲】与【单集拆分】，并给出清晰的分集规划，适合短剧拍摄和后续分镜。\n\n【故事想法】${theme || "未单独提供，以原剧本为准"}\n【主要人物】${characters || "未单独提供，以原剧本为准"}${episodeLine}\n【原剧本】\n${script || "（未提供完整剧本，请根据故事想法与主要人物进行整理）"}\n\n要求：\n1. 输出【整体大纲】【人物关系】【单集拆分】三部分。\n2. 如提供了目标集数，单集拆分按目标集数输出；否则按剧情自然拆分。\n3. 每集要包含本集目标、冲突推进、结尾悬念。\n4. 不要输出分析过程，只输出整理结果。`;
}

async function callOpenAICompatible(prompt: string, model: string, apiConfig = getEnvApiConfig()) {
  const { apiKey, baseUrl } = apiConfig;
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

    const envConfig = getEnvApiConfig();
    const route = await resolveModelRoute("text", body.model);
    const profile = route?.profile;
    const apiConfig = {
      apiKey: profile?.apiKey || envConfig.apiKey,
      baseUrl: profile?.baseUrl || envConfig.baseUrl,
      model: route?.model || envConfig.model
    };
    const model = body.model || apiConfig.model;
    if (body.model && !route) {
      return NextResponse.json({ code: 400, message: "当前没有启用的渠道支持所选文字处理模型，请在模型渠道管理中补充后重试。" }, { status: 400 });
    }
    const prompt = buildPrompt({ ...body, action });
    const content = await callOpenAICompatible(prompt, model, apiConfig);

    return NextResponse.json({ code: 0, data: { content, model, action } });
  } catch (error) {
    return NextResponse.json(
      { code: 500, message: error instanceof Error ? error.message : "AI 剧本生成失败" },
      { status: 500 }
    );
  }
}
