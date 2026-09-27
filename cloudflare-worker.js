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


function utf8Bytes(s) {
  return new TextEncoder().encode(String(s));
}
function rotl(x,n){ return (x<<n)|(x>>>(32-n)); }
function md5(inputBytes){
  const bytes=new Uint8Array(inputBytes);
  const bitLen=bytes.length*8;
  const len=((bytes.length+9+63)>>6)<<6;
  const m=new Uint8Array(len); m.set(bytes); m[bytes.length]=0x80;
  const dv=new DataView(m.buffer);
  dv.setUint32(len-8, bitLen>>>0, true); dv.setUint32(len-4, Math.floor(bitLen/4294967296)>>>0, true);
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  const K=[]; for(let i=0;i<64;i++) K[i]=Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0;
  const S=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  for(let off=0;off<len;off+=64){
    const M=new Uint32Array(16); for(let i=0;i<16;i++) M[i]=dv.getUint32(off+i*4,true);
    let A=a0,B=b0,C=c0,D=d0;
    for(let i=0;i<64;i++){
      let F,g;
      if(i<16){F=(B&C)|((~B)&D);g=i}
      else if(i<32){F=(D&B)|((~D)&C);g=(5*i+1)%16}
      else if(i<48){F=B^C^D;g=(3*i+5)%16}
      else {F=C^(B|(~D));g=(7*i)%16}
      const round=i<16?0:i<32?1:i<48?2:3;
      const q=(A+F+K[i]+M[g])>>>0;
      const rr=S[round*4+(i%4)];
      const T=rotl(q,rr);
      A=D;D=C;C=B;B=(B+T)>>>0;
    }
    a0=(a0+A)>>>0;b0=(b0+B)>>>0;c0=(c0+C)>>>0;d0=(d0+D)>>>0;
  }
  const out=new Uint8Array(16), od=new DataView(out.buffer);
  od.setUint32(0,a0,true);od.setUint32(4,b0,true);od.setUint32(8,c0,true);od.setUint32(12,d0,true);
  return out;
}
function concatBytes(a,b){const x=new Uint8Array(a.length+b.length);x.set(a);x.set(b,a.length);return x;}
function hmacMd5(keyBytes,msgBytes){
  let k=new Uint8Array(keyBytes); if(k.length>64)k=md5(k);
  const kk=new Uint8Array(64);kk.set(k);
  const o=new Uint8Array(64),i=new Uint8Array(64);
  for(let n=0;n<64;n++){o[n]=kk[n]^0x5c;i[n]=kk[n]^0x36}
  return md5(concatBytes(o,md5(concatBytes(i,msgBytes))));
}
function hex(bytes){return Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();}
function taobaoSign(params, secret){
  const keys=Object.keys(params).filter(k=>params[k]!==undefined&&params[k]!==null&&params[k]!=="").sort();
  const plain=keys.map(k=>k+String(params[k])).join("");
  return hex(hmacMd5(utf8Bytes(secret),utf8Bytes(plain)));
}
function pickArray(v){
  if(Array.isArray(v)) return v;
  if(v && Array.isArray(v.item_promotion_dto)) return v.item_promotion_dto;
  return [];
}
function cleanItem(x){
  const name=String(x.item_name||"").split("|")[1]||String(x.item_name||"");
  const price=Number(x.sell_price_cent||0)/100;
  const link=x.h5_promotion?.short_link||x.h5_promotion?.h5_url||x.taobao_promotion?.h5_short_url||x.taobao_promotion?.h5_url||x.app_promotion?.deep_link||"";
  return {
    source:"taobao", id:String(x.item_id||""), name:name.trim(), rawName:String(x.item_name||""),
    price:Number(price.toFixed(2)), originalPrice:Number((Number(x.original_price_cent||0)/100).toFixed(2)),
    discount:String(x.discount||""), image:String(x.picture||""), sales:String(x.total_sales||""),
    stock:Number(x.stock||0), shops:Number(x.apply_shop_count||0), cities:Number(x.apply_city_count||0),
    category:"正餐", url:link
  };
}
\nfunction extractText(data) {
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

    if (url.pathname === "/music") {
      if (request.method !== "GET") return json({ ok:false, error:"音乐搜索只接受 GET 请求" },405,origin);
      const q = String(url.searchParams.get("q") || "").trim().slice(0,120);
      if (!q) return json({ ok:false, error:"请输入歌名、歌手或音乐氛围" },400,origin);

      // 音乐源：Apple/iTunes 为主，Deezer 作为备用。
      // 只返回官方接口提供的合法试听片段/歌曲页面，不抓取或破解完整音源。
      const results = [];

      try {
        const api = "https://itunes.apple.com/search?term="+encodeURIComponent(q)+"&media=music&entity=song&limit=20&country=CN";
        const r = await fetch(api, { headers:{ "Accept":"application/json" } });
        if (r.ok) {
          const data = await r.json();
          for (const x of (data.results||[])) {
            const item = {
              id:"itunes-"+String(x.trackId||x.collectionId||""),
              name:String(x.trackName||""),
              artist:String(x.artistName||""),
              album:String(x.collectionName||""),
              artwork:String(x.artworkUrl100||x.artworkUrl60||"").replace("100x100","600x600"),
              preview:String(x.previewUrl||""),
              link:String(x.trackViewUrl||x.collectionViewUrl||""),
              source:"Apple Music"
            };
            if (item.name && item.preview) results.push(item);
          }
        }
      } catch(e) {}

      // Apple 没有可试听结果时，再尝试 Deezer 公共搜索接口。
      if (!results.length) {
        try {
          const api = "https://api.deezer.com/search?q="+encodeURIComponent(q)+"&limit=20";
          const r = await fetch(api, { headers:{ "Accept":"application/json" } });
          if (r.ok) {
            const data = await r.json();
            for (const x of (data.data||[])) {
              const item = {
                id:"deezer-"+String(x.id||""),
                name:String(x.title||""),
                artist:String(x.artist?.name||""),
                album:String(x.album?.title||""),
                artwork:String(x.album?.cover_big||x.album?.cover_medium||""),
                preview:String(x.preview||""),
                link:String(x.link||""),
                source:"Deezer"
              };
              if (item.name && item.preview) results.push(item);
            }
          }
        } catch(e) {}
      }

      return json({
        ok:true,
        query:q,
        source:results.length ? results[0].source : null,
        results:results.slice(0,20)
      },200,origin);
    }

    if (url.pathname === "/lyrics") {
      if (request.method !== "GET") return json({ok:false,error:"歌词搜索只接受 GET 请求"},405,origin);
      const track=String(url.searchParams.get("track")||"").trim().slice(0,160);
      const artist=String(url.searchParams.get("artist")||"").trim().slice(0,120);
      if(!track) return json({ok:false,error:"缺少歌曲名"},400,origin);
      try{
        const api="https://lrclib.net/api/get?track_name="+encodeURIComponent(track)+"&artist_name="+encodeURIComponent(artist);
        const r=await fetch(api,{headers:{"Accept":"application/json","User-Agent":"EatWhat-Music/1.0"}});
        if(!r.ok)return json({ok:true,lines:[]},200,origin);
        const data=await r.json();
        const raw=String(data.syncedLyrics||"");
        const lines=raw.split(/\r?\n/).map(line=>{
          const m=line.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
          if(!m)return null;
          return {time:Number(m[1])*60+Number(m[2]),text:String(m[3]||"").trim()};
        }).filter(x=>x&&x.text);
        return json({ok:true,track,artist,lines},200,origin);
      }catch(e){return json({ok:true,lines:[]},200,origin)}
    }


    if (url.pathname === "/delivery") {
      if (request.method !== "GET") return json({ok:false,error:"外卖接口只接受 GET 请求"},405,origin);
      const platform=String(url.searchParams.get("platform")||"taobao").trim();
      const budget=Number(url.searchParams.get("budget")||0);
      const category=String(url.searchParams.get("category")||"").trim();
      if(platform!=="taobao") return json({ok:true,source:platform,live:false,results:[],message:"该平台官方实时接口尚未配置"},200,origin);
      if(!env.TAOBAO_APP_KEY || !env.TAOBAO_APP_SECRET || !env.TAOBAO_PID){
        return json({ok:false,live:false,code:"TAOBAO_NOT_CONFIGURED",error:"淘宝闪购推广参数尚未配置"},503,origin);
      }
      const bizType=String(env.TAOBAO_BIZ_TYPE||"hot_item");
      const qr={biz_type:bizType,pid:String(env.TAOBAO_PID),page_number:1,page_size:20};
      const cityCode=String(url.searchParams.get("city_code")||"").trim();
      if(cityCode)qr.city_code=cityCode;
      const params={
        method:"alibaba.alsc.union.eleme.promotion.itempromotion.query",
        app_key:String(env.TAOBAO_APP_KEY),format:"json",sign_method:"hmac",
        timestamp:new Date().toLocaleString("sv-SE",{timeZone:"Asia/Shanghai"}).replace("T"," "),
        v:"2.0",query_request:JSON.stringify(qr)
      };
      params.sign=taobaoSign(params,String(env.TAOBAO_APP_SECRET));
      try{
        const body=new URLSearchParams(params);
        const r=await fetch("https://eco.taobao.com/router/rest",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body});
        const data=await r.json();
        if(!r.ok)return json({ok:false,live:false,error:"淘宝闪购接口请求失败"},502,origin);
        const root=data?.alibaba_alsc_union_eleme_promotion_itempromotion_query_response||data;
        const records=pickArray(root?.data?.records);
        const results=records.map(cleanItem).filter(x=>x.name && x.price>0 && (!budget||x.price<=budget) && (!category||category==="all"||x.category===category));
        return json({ok:true,live:true,source:"taobao",results,rawTotal:Number(root?.data?.total||results.length)},200,origin);
      }catch(e){return json({ok:false,live:false,error:"淘宝闪购接口网络请求失败"},502,origin)}
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
      const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 80) : (Array.isArray(body.foods) ? body.foods.slice(0,80) : []);
      const requestText = String(body.requestText || body.context || "").trim();
      const taste = String(body.tasteFilter || "随便").trim(), budget = String(body.budget || "").trim(), people = String(body.people || "").trim();
      if (!candidates.length) return json({ ok:false, error:"没有可供AI选择的菜品" },400,origin);
      const prompt=["你是“吃点啥”里的AI点餐顾问。根据预算、人数、口味和用户文字要求，从候选菜单中真正帮用户做决定。只能选候选菜名，不得虚构。返回严格JSON：winner、reason、alternatives、orderTip、confidence。",
      "预算："+budget+"；人数："+people+"；口味："+taste+"；用户要求："+(requestText||"无"),
      "候选："+JSON.stringify(candidates.map(x=>({name:x.n,category:x.cat,region:x.region||""})))].join("\n");
      try{
        const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5-mini",input:prompt,max_output_tokens:700})});
        const data=await r.json(); if(!r.ok)return json({ok:false,error:data?.error?.message||"OpenAI请求失败"},r.status,origin);
        const parsed=parseJson(extractText(data)); if(!parsed)return json({ok:false,error:"AI返回内容解析失败"},502,origin);
        const names=new Set(candidates.map(x=>x.n)); const winner=names.has(String(parsed.winner||""))?String(parsed.winner):candidates[0].n;
        const alternatives=Array.isArray(parsed.alternatives)?parsed.alternatives.filter(x=>names.has(String(x))).slice(0,2):[];
        return json({ok:true,winner,reason:String(parsed.reason||"根据你的条件综合选择。"),alternatives,orderTip:String(parsed.orderTip||"按人数适量点餐。"),confidence:Math.max(1,Math.min(5,Number(parsed.confidence)||4))},200,origin);
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
