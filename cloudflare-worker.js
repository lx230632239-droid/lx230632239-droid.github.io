const ALLOW_ORIGIN = "https://lx230632239-droid.github.io";

function cors(origin = ALLOW_ORIGIN) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOW_ORIGIN ? origin : ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function extractSources(data) {
  const out = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      for (const a of c.annotations || []) {
        const u = a?.url_citation?.url || a?.url;
        const t = a?.url_citation?.title || a?.title;
        if (u && !out.some(x => x.url === u)) out.push({ url: String(u), title: String(t || u) });
      }
    }
  }
  return out.slice(0, 6);
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

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "吃点啥 AI",
        openaiKeyConfigured: Boolean(env.OPENAI_API_KEY),
        time: new Date().toISOString()
      }, 200, origin);
    }

    if (url.pathname === "/music-ai") {
      if (request.method !== "GET") return json({ ok:false, error:"AI音乐搜索只接受 GET 请求" },405,origin);
      if (!env.OPENAI_API_KEY) return json({ok:false,error:"Cloudflare 中没有找到 OPENAI_API_KEY"},500,origin);
      const q = String(url.searchParams.get("q") || "").trim().slice(0,160);
      if (!q) return json({ok:false,error:"请输入音乐氛围、场景、歌手或歌名"},400,origin);
      try {
        const prompt = [
          "你是音乐搜索助手。把用户的自然语言需求转换成适合 iTunes 歌曲搜索的简短关键词。",
          "保留歌手、歌曲名等明确实体；如果是氛围，生成2到5个中文或英文音乐关键词。",
          "只返回JSON：{\"query\":\"搜索关键词\",\"reason\":\"一句话说明\"}。",
          "用户需求："+q
        ].join("\n");
        const r = await fetch("https://api.openai.com/v1/responses", {
          method:"POST",
          headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
          body:JSON.stringify({model:"gpt-5.5",tools:[{type:"web_search",search_context_size:"low"}],input:prompt,max_output_tokens:220})
        });
        const data=await r.json();
        if(!r.ok) return json({ok:false,error:data?.error?.message||"AI音乐搜索失败"},r.status,origin);
        const parsed=parseJson(extractText(data));
        const searchQuery=String(parsed?.query||q).trim().slice(0,120);
        const api="https://itunes.apple.com/search?term="+encodeURIComponent(searchQuery)+"&media=music&entity=song&limit=12&country=CN";
        const mr=await fetch(api,{headers:{"Accept":"application/json"}});
        const md=await mr.json();
        if(!mr.ok) return json({ok:false,error:"在线音乐搜索失败"},502,origin);
        const results=(md.results||[]).map(x=>({
          id:String(x.trackId||x.collectionId||""),
          name:String(x.trackName||""),
          artist:String(x.artistName||""),
          album:String(x.collectionName||""),
          artwork:String(x.artworkUrl100||x.artworkUrl60||"").replace("100x100","600x600"),
          preview:String(x.previewUrl||""),
          link:String(x.trackViewUrl||x.collectionViewUrl||"")
        })).filter(x=>x.name&&x.preview);
        return json({ok:true,query:q,searchQuery,reason:String(parsed?.reason||"根据你的需求搜索相关歌曲。"),results,sources:extractSources(data)},200,origin);
      } catch(e) {
        return json({ok:false,error:"AI音乐搜索网络请求失败"},502,origin);
      }
    }

    if (url.pathname === "/music") {
      if (request.method !== "GET") return json({ ok:false, error:"音乐搜索只接受 GET 请求" },405,origin);
      const q = String(url.searchParams.get("q") || "").trim().slice(0,120);
      if (!q) return json({ ok:false, error:"请输入歌名、歌手或音乐氛围" },400,origin);
      try {
        const api = "https://itunes.apple.com/search?term="+encodeURIComponent(q)+"&media=music&entity=song&limit=12&country=CN";
        const r = await fetch(api, { headers:{ "Accept":"application/json" } });
        const data = await r.json();
        if (!r.ok) return json({ok:false,error:"在线音乐搜索失败"},502,origin);
        const results=(data.results||[]).map(x=>({
          id:String(x.trackId||x.collectionId||""),
          name:String(x.trackName||""),
          artist:String(x.artistName||""),
          album:String(x.collectionName||""),
          artwork:String(x.artworkUrl100||x.artworkUrl60||"").replace("100x100","600x600"),
          preview:String(x.previewUrl||""),
          link:String(x.trackViewUrl||x.collectionViewUrl||"")
        })).filter(x=>x.name&&x.preview);
        return json({ok:true,query:q,results},200,origin);
      } catch(e) {
        return json({ok:false,error:"在线音乐服务暂时不可用"},502,origin);
      }
    }

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

    const mode = String(body.mode || "food").trim();
    const name = String(body.name || "").trim();
    if (mode === "decide") {
      const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 80) : [];
      const requestText = String(body.requestText || "").trim();
      const taste = String(body.tasteFilter || "随便").trim(), budget = String(body.budget || "").trim(), people = String(body.people || "").trim();
      if (!candidates.length) return json({ ok:false, error:"没有可供AI选择的菜品" },400,origin);
      const prompt=["你是“吃点啥”里的AI点餐顾问。必须先使用联网检索核对与菜品、口味或用户要求有关的公开资料，再结合预算、人数、口味和用户文字要求做决定。只能选候选菜名，不得虚构。返回严格JSON：winner、reason、alternatives、orderTip、confidence。reason要简要说明联网资料中真正有帮助的信息。",
      "预算："+budget+"；人数："+people+"；口味："+taste+"；用户要求："+(requestText||"无"),
      "候选："+JSON.stringify(candidates.map(x=>({name:x.n,category:x.cat,region:x.region||""})))].join("\n");
      try{
        const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.5",tools:[{type:"web_search",search_context_size:"low"}],input:prompt,max_output_tokens:900})});
        const data=await r.json(); if(!r.ok)return json({ok:false,error:data?.error?.message||"OpenAI请求失败"},r.status,origin);
        const parsed=parseJson(extractText(data)); if(!parsed)return json({ok:false,error:"AI返回内容解析失败"},502,origin);
        const names=new Set(candidates.map(x=>x.n)); const winner=names.has(String(parsed.winner||""))?String(parsed.winner):candidates[0].n;
        const alternatives=Array.isArray(parsed.alternatives)?parsed.alternatives.filter(x=>names.has(String(x))).slice(0,2):[];
        return json({ok:true,winner,reason:String(parsed.reason||"根据你的条件综合选择。"),alternatives,orderTip:String(parsed.orderTip||"按人数适量点餐。"),confidence:Math.max(1,Math.min(5,Number(parsed.confidence)||4)),sources:extractSources(data)},200,origin);
      }catch(e){return json({ok:false,error:"AI接口网络请求失败"},502,origin);}
    }


    const category = String(body.category || "").trim();
    const region = String(body.region || "").trim();
    const tasteFilter = String(body.tasteFilter || "随便").trim();
    const budget = String(body.budget || "").trim();
    const people = String(body.people || "").trim();

    if (!name) return json({ ok: false, error: "缺少菜品名称" }, 400, origin);

    const prompt = [
      "你是“吃点啥”美食决定器的中文美食编辑。",
      "必须先使用联网检索核对指定菜品的真实公开资料，再生成简洁、准确、好吃诱人的信息。优先参考可靠的百科、地方文化机构、餐饮文化资料等公开来源。",
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
          model: "gpt-5.5",
          tools: [{ type: "web_search", search_context_size: "low" }],
          input: prompt,
          max_output_tokens: 700
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
        tasteScore: Math.max(1, Math.min(5, Number(parsed.tasteScore) || 4.5)),
        sources: extractSources(data)
      }, 200, origin);
    } catch (e) {
      return json({ ok: false, error: "AI接口网络请求失败" }, 502, origin);
    }
  }
};
