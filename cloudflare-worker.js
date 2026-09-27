const ALLOW_ORIGIN = "https://lx230632239-droid.github.io";

function cors(origin = ALLOW_ORIGIN) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOW_ORIGIN ? origin : ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

function json(data, status = 200, origin = ALLOW_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" }
  });
}

function extractText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      if (typeof c.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n");
}

function parseJson(text) {
  const cleaned = String(text || "")
    .replace(/^\s*\`\`\`json\s*/i, "")
    .replace(/^\s*\`\`\`\s*/i, "")
    .replace(/\s*\`\`\`\s*$/i, "")
    .trim();
  try { return JSON.parse(cleaned); } catch {}
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try { return JSON.parse(cleaned.slice(a, b + 1)); } catch {}
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || ALLOW_ORIGIN;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/food") {
      return json({ ok: true, service: "吃点啥 AI", message: "AI接口已部署，请使用 POST /food" }, 200, origin);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "只接受 POST 请求" }, 405, origin);
    }

    if (!env.OPENAI_API_KEY) {
      return json({ ok: false, error: "Cloudflare 中没有找到 OPENAI_API_KEY" }, 500, origin);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ ok: false, error: "请求数据不是有效 JSON" }, 400, origin); }

    const name = String(body.name || "").trim();
    const category = String(body.category || "").trim();
    const region = String(body.region || "").trim();
    const tasteFilter = String(body.tasteFilter || "随便").trim();
    const budget = String(body.budget || "").trim();
    const people = String(body.people || "").trim();

    if (!name) return json({ ok: false, error: "缺少菜品名称" }, 400, origin);

    const prompt = [
      "你是“吃点啥”美食决定器的中文美食编辑。",
      "请只根据真实常识，为指定菜品生成简洁、准确、好吃诱人的信息。",
      "不要编造具体餐厅、店铺、历史人物或无法确认的年份。",
      "地点可以写菜品公认的发源地、代表地区或最具代表性的地域；不确定时写“中国各地”。",
      "故事写成2到3句，讲清来源、饮食文化或吃法，不要写虚构故事。",
      "点评要像真实美食编辑，不夸张，不空泛。",
      "推荐指数和口味评分都是1到5的数字，不是医学或营养建议。",
      "用户条件：口味="+tasteFilter+"；预算="+budget+"；人数="+people+"。",
      "菜品名称："+name+"；分类："+category+"；现有地区："+region+"。",
      "严格只返回JSON，不要Markdown，不要代码块。JSON字段必须是：",
      '{"region":"地点","story":"故事","desc":"一句话美食点评","taste":"更详细的口味描述","recommend":4.5,"tasteScore":4.6}'
    ].join("\n");

    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          input: prompt,
          max_output_tokens: 500
        })
      });

      const data = await r.json();
      if (!r.ok) {
        return json({ ok: false, error: data?.error?.message || "OpenAI 请求失败" }, r.status, origin);
      }

      const parsed = parseJson(extractText(data));
      if (!parsed) return json({ ok: false, error: "AI返回内容解析失败" }, 502, origin);

      return json({
        ok: true,
        region: String(parsed.region || region || "中国各地"),
        story: String(parsed.story || ""),
        desc: String(parsed.desc || ""),
        taste: String(parsed.taste || parsed.desc || ""),
        recommend: Math.max(1, Math.min(5, Number(parsed.recommend) || 4.5)),
        tasteScore: Math.max(1, Math.min(5, Number(parsed.tasteScore) || 4.5))
      }, 200, origin);
    } catch (e) {
      return json({ ok: false, error: "AI接口网络请求失败" }, 502, origin);
    }
  }
};
