export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const kv  = env.GW_KV;
    if (!kv) return html('<h2 style="font-family:sans-serif;padding:40px">请先绑定 KV 命名空间 GW_KV</h2>', 500);

    if (url.pathname === '/' && request.method === 'GET')
      return new Response(renderMain(), { headers: ct('text/html') });

    if (url.pathname === '/docs' && request.method === 'GET')
      return new Response(renderDocs(), { headers: ct('text/html') });

    if (url.pathname === '/admin' && request.method === 'GET')
      return new Response(renderAdmin(), { headers: ct('text/html') });

    if (url.pathname === '/admin' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return json({ ok:false, error:'格式错误' }, 400); }
      const savedPwd = await kv.get('ADMIN_PASSWORD');
      if (savedPwd && body.password !== savedPwd)
        return json({ ok:false, error:'密码错误' }, 401);
      for (const f of ['ADMIN_PASSWORD','ACCESS_CODE','GH_TOKEN','GH_OWNER','GH_REPO','GH_WORKFLOW','GH_REF'])
        if (body[f] != null && body[f] !== '') await kv.put(f, String(body[f]));
      return json({ ok:true });
    }

    if (url.pathname === '/admin/get' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return json({ ok:false, error:'格式错误' }, 400); }
      const savedPwd = await kv.get('ADMIN_PASSWORD');
      if (savedPwd && body.password !== savedPwd)
        return json({ ok:false, error:'密码错误' }, 401);
      return json({ ok:true, cfg:{
        GH_OWNER:    await kv.get('GH_OWNER')    || '',
        GH_REPO:     await kv.get('GH_REPO')     || '',
        GH_WORKFLOW: await kv.get('GH_WORKFLOW') || '',
        GH_REF:      await kv.get('GH_REF')      || '',
        ACCESS_CODE: await kv.get('ACCESS_CODE') || '',
        hasToken:   !!(await kv.get('GH_TOKEN')),
        hasPassword:!!(await kv.get('ADMIN_PASSWORD')),
      }});
    }

    if (url.pathname === '/api/run' && request.method === 'POST') {
      let body; try { body = await request.json(); } catch { return json({ ok:false, error:'请求格式错误' }, 400); }
      let ghToken, owner, repo, workflow, ref;
      if (body.useAccessCode) {
        const savedCode = await kv.get('ACCESS_CODE');
        if (!savedCode || body.accessCode !== savedCode)
          return json({ ok:false, error:'授权码错误' }, 401);
        ghToken  = await kv.get('GH_TOKEN');
        owner    = await kv.get('GH_OWNER');
        repo     = await kv.get('GH_REPO');
        workflow = await kv.get('GH_WORKFLOW') || 'auto.yml';
        ref      = await kv.get('GH_REF')      || 'main';
        if (!ghToken || !owner || !repo)
          return json({ ok:false, error:'服务端配置未完善，请先前往 /admin 设置' }, 500);
      } else {
        ghToken  = body.ghToken;
        owner    = body.ghOwner;
        repo     = body.ghRepo;
        workflow = body.ghWorkflow || 'auto.yml';
        ref      = body.ghRef     || 'main';
        if (!ghToken || !owner || !repo)
          return json({ ok:false, error:'请填写完整的 GitHub 配置' }, 400);
      }
      const inputs = {
        mode:          String(body.mode || 'pixel'),
        intensity_cap: String(clamp(body.intensityCap ?? 4, 1, 10)),
        skip_weekends: String(!!body.skipWeekends),
        start:         body.start      ? String(body.start)      : '',
        end:           body.end        ? String(body.end)        : '',
        base_sunday:   body.baseSunday ? String(body.baseSunday) : '',
        random_max:    String(clamp(body.randomMax ?? 4, 0, 10)),
        grid_json:     Array.isArray(body.grid) ? JSON.stringify(body.grid) : ''
      };
      const ghResp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
        { method:'POST', headers:{
            'accept':        'application/vnd.github+json',
            'authorization': `Bearer ${ghToken}`,
            'content-type':  'application/json',
            'user-agent':    'cf-worker-greenwall'
          }, body: JSON.stringify({ ref, inputs }) }
      );
      if (!ghResp.ok) {
        const t = await ghResp.text();
        return json({ ok:false, error:'GitHub Actions 触发失败', status:ghResp.status, detail:t.slice(0,500) }, 502);
      }
      return json({ ok:true });
    }

    return new Response('页面不存在', { status:404 });
  }
};

function json(obj, status=200) {
  return new Response(JSON.stringify(obj), { status, headers:{ 'content-type':'application/json;charset=utf-8','cache-control':'no-store' }});
}
function html(body, status=200) {
  return new Response(body, { status, headers: ct('text/html') });
}
function ct(type) { return { 'content-type': type+';charset=utf-8' }; }
function clamp(v, min, max) {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? min : Math.min(max, Math.max(min, n));
}

function sharedCSS() { return `
:root{--bg:#FAFAFA;--text:#0B0B0B;--muted:rgba(0,0,0,.50);--glass:rgba(255,255,255,.22);--glass2:rgba(255,255,255,.12);--border:rgba(0,0,0,.08);--shadow:rgba(0,0,0,.15);--c0:#ebedf0;--c1:#9be9a8;--c2:#40c463;--c3:#30a14e;--c4:#216e39;--green:#2ea043}
@media(prefers-color-scheme:dark){:root{--bg:#0D1117;--text:#F2F2F2;--muted:rgba(255,255,255,.50);--glass:rgba(22,27,34,.70);--glass2:rgba(22,27,34,.45);--border:rgba(255,255,255,.08);--shadow:rgba(0,0,0,.55);--c0:#161b22;--c1:#0e4429;--c2:#006d32;--c3:#26a641;--c4:#39d353;--green:#3fb950}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,system-ui,Inter,Helvetica,Arial,sans-serif;background:radial-gradient(1100px 500px at 15% -5%,rgba(0,100,0,.06),transparent 55%),radial-gradient(900px 700px at 95% 5%,rgba(0,80,0,.04),transparent 50%),var(--bg);color:var(--text);line-height:1.75;min-height:100dvh}
@media(prefers-color-scheme:dark){body{background:radial-gradient(1100px 500px at 15% -5%,rgba(57,211,83,.05),transparent 55%),radial-gradient(900px 700px at 95% 5%,rgba(38,166,65,.04),transparent 50%),var(--bg)}}
.wrap{max-width:1140px;margin:0 auto;padding:22px 16px 48px}
.nav{position:sticky;top:12px;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--glass);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);border:1px solid var(--border);border-radius:24px;box-shadow:0 10px 40px var(--shadow),inset 0 1px 0 rgba(255,255,255,.06);padding:12px 20px;margin-bottom:20px}
.brand{display:flex;align-items:center;gap:10px}
.brand-title{font-size:15px;font-weight:760;letter-spacing:.1px}
.brand-sub{font-size:11px;color:var(--muted);margin-top:1px;font-family:'SF Mono',Menlo,monospace}
.nav-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.logo-icon{display:grid;grid-template-columns:repeat(3,5px);grid-template-rows:repeat(3,5px);gap:1.5px;flex-shrink:0}
.logo-icon span{border-radius:1px}
.logo-icon span:nth-child(1){background:var(--c0)}.logo-icon span:nth-child(2){background:var(--c1)}.logo-icon span:nth-child(3){background:var(--c2)}.logo-icon span:nth-child(4){background:var(--c1)}.logo-icon span:nth-child(5){background:var(--c3)}.logo-icon span:nth-child(6){background:var(--c3)}.logo-icon span:nth-child(7){background:var(--c2)}.logo-icon span:nth-child(8){background:var(--c3)}.logo-icon span:nth-child(9){background:var(--c4)}
.pill{border-radius:999px;border:1px solid var(--border);background:var(--glass2);padding:7px 14px;font-size:12px;color:var(--text);outline:none;display:inline-flex;align-items:center;gap:6px;transition:transform .25s cubic-bezier(.4,0,.2,1),filter .25s;cursor:pointer;text-decoration:none}
.pill:hover{transform:scale(1.04);filter:brightness(1.08)}
.badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid var(--border);background:var(--glass2);padding:5px 12px;font-size:11px;color:var(--muted)}
.dot{width:7px;height:7px;border-radius:50%;background:rgba(0,0,0,.20);transition:background .3s;flex-shrink:0}
@media(prefers-color-scheme:dark){.dot{background:rgba(255,255,255,.20)}}
.dot.ok{background:#39d353}.dot.err{background:#f85149}.dot.run{background:#e3b341;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
.card{position:relative;overflow:hidden;background:var(--glass);backdrop-filter:blur(20px) saturate(150%);-webkit-backdrop-filter:blur(20px) saturate(150%);border:1px solid var(--border);border-radius:28px;box-shadow:0 14px 48px var(--shadow),inset 0 1px 0 rgba(255,255,255,.06);padding:20px;transition:transform .35s cubic-bezier(.4,0,.2,1),box-shadow .35s}
.card:hover{transform:translateY(-2px) scale(1.008);box-shadow:0 20px 60px var(--shadow),inset 0 1px 0 rgba(255,255,255,.06)}
.card::before{content:"";pointer-events:none;position:absolute;inset:-40% -20% auto auto;width:480px;height:480px;background:radial-gradient(circle at 35% 35%,rgba(57,211,83,.07),transparent 52%);transform:rotate(10deg)}
.card-title{font-size:18px;font-weight:800;letter-spacing:-.2px;margin-bottom:14px;display:flex;align-items:center;gap:10px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:600px){.row2{grid-template-columns:1fr}}
.field{display:grid;gap:5px}
.field label{font-size:11px;color:var(--muted)}
.input{border-radius:14px;border:1px solid var(--border);background:var(--glass2);color:var(--text);padding:8px 13px;font-size:12px;outline:none;font-family:inherit;transition:box-shadow .2s,border-color .2s}
.input:focus{box-shadow:0 0 0 2px rgba(57,211,83,.22);border-color:rgba(57,211,83,.38)}
.gap8{height:8px}.gap12{height:12px}.gap16{height:16px}
.ck-wrap{display:flex;gap:8px;align-items:center;cursor:pointer;font-size:12px;color:var(--muted);padding-top:6px}
.ck-wrap input{appearance:none;-webkit-appearance:none;width:15px;height:15px;border-radius:4px;border:1.5px solid var(--border);background:var(--glass2);cursor:pointer;position:relative;flex-shrink:0;transition:background .2s,border-color .2s}
.ck-wrap input:checked{background:var(--green);border-color:var(--green)}
.ck-wrap input:checked::after{content:"";position:absolute;left:3px;top:1px;width:5px;height:8px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(45deg)}
.btn{position:relative;overflow:hidden;width:100%;border-radius:999px;border:none;background:linear-gradient(135deg,#2ea043,#3fb950);color:#fff;padding:13px 18px;font-size:13px;font-weight:700;letter-spacing:.1px;cursor:pointer;box-shadow:0 4px 20px rgba(46,160,67,.35);display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .35s cubic-bezier(.4,0,.2,1),filter .35s,box-shadow .35s}
.btn:hover{transform:scale(1.03);filter:brightness(1.10);box-shadow:0 6px 28px rgba(46,160,67,.50)}
.btn:active{transform:scale(1.01)}
.btn:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none;box-shadow:none}
.btn.ghost{background:var(--glass2);color:var(--text);border:1px solid var(--border);box-shadow:none}
.btn.ghost:hover{box-shadow:none;filter:brightness(1.06)}
.ripple{position:absolute;border-radius:50%;transform:translate(-50%,-50%) scale(0);background:radial-gradient(circle,rgba(255,255,255,.50),rgba(255,255,255,0) 65%);width:10px;height:10px;pointer-events:none;animation:rpl .6s cubic-bezier(.4,0,.2,1) forwards}
@keyframes rpl{to{width:640px;height:640px;transform:translate(-50%,-50%) scale(1);opacity:0}}
.toast{display:none;margin-top:10px;border-radius:14px;border:1px solid var(--border);background:var(--glass2);padding:9px 14px;font-size:12px;color:var(--muted);line-height:1.55}
.toast.on{display:block}.toast.fail{border-color:rgba(248,81,73,.28);color:#f85149}.toast.succ{border-color:rgba(57,211,83,.28);color:var(--green)}
.icon-gear{width:16px;height:16px;flex-shrink:0;position:relative}
.icon-gear::before{content:"";position:absolute;inset:3px;border-radius:50%;border:2.5px solid var(--text)}
.icon-gear::after{content:"";position:absolute;inset:0;background:linear-gradient(var(--text),var(--text)) 50% 0/2.5px 4px no-repeat,linear-gradient(var(--text),var(--text)) 50% 100%/2.5px 4px no-repeat,linear-gradient(var(--text),var(--text)) 0 50%/4px 2.5px no-repeat,linear-gradient(var(--text),var(--text)) 100% 50%/4px 2.5px no-repeat}
.ic-rocket{width:14px;height:14px;position:relative;flex-shrink:0}
.ic-rocket::before{content:"";position:absolute;left:50%;top:0;transform:translateX(-50%);width:6px;height:10px;background:#fff;clip-path:polygon(50% 0%,100% 60%,80% 100%,20% 100%,0% 60%)}
.ic-rocket::after{content:"";position:absolute;left:50%;bottom:-2px;transform:translateX(-50%);width:4px;height:4px;background:rgba(255,220,100,.9);border-radius:50% 50% 50% 50%/30% 30% 70% 70%}
.ic-lock{width:12px;height:14px;position:relative;flex-shrink:0}
.ic-lock::before{content:"";position:absolute;top:0;left:1px;width:10px;height:7px;border:2px solid currentColor;border-radius:5px 5px 0 0;border-bottom:none}
.ic-lock::after{content:"";position:absolute;bottom:0;left:0;width:12px;height:8px;background:currentColor;border-radius:3px}
.ic-save{width:14px;height:14px;flex-shrink:0;position:relative;border:2px solid #fff;border-radius:2px}
.ic-save::before{content:"";position:absolute;top:-1px;left:2px;width:6px;height:5px;background:#fff;border-radius:0 0 1px 1px}
.ic-save::after{content:"";position:absolute;bottom:1px;left:1px;right:1px;height:5px;background:rgba(255,255,255,.4);border-radius:1px}
.tag{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:10px;background:rgba(57,211,83,.12);color:var(--green);border:1px solid rgba(57,211,83,.20);margin-left:8px}
.tag.warn{background:rgba(248,81,73,.10);color:#f85149;border-color:rgba(248,81,73,.20)}
.divider{height:1px;background:var(--border);margin:16px 0}
.section-title{font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.8px;text-transform:uppercase;margin:16px 0 8px}
`; }

function renderMain() { return `<!doctype html>
<html lang="zh-Hans"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>绿油油</title>
<style>
${sharedCSS()}
.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:16px;align-items:start}
@media(max-width:860px){.hero{grid-template-columns:1fr}}
.pg-wrap{padding:14px;border-radius:18px;border:1px solid var(--border);background:rgba(255,255,255,.60);overflow-x:auto;user-select:none;-webkit-user-select:none}
@media(prefers-color-scheme:dark){.pg-wrap{background:rgba(13,17,23,.85)}}
.pg{display:grid;grid-template-columns:repeat(52,12px);grid-auto-rows:12px;gap:3px;width:max-content}
.cell{width:12px;height:12px;border-radius:3px;cursor:pointer;transition:transform .15s cubic-bezier(.4,0,.2,1),filter .15s}
.cell:hover{transform:scale(1.25);filter:brightness(1.15)}
.l0{background:var(--c0)}.l1{background:var(--c1)}.l2{background:var(--c2)}.l3{background:var(--c3)}.l4{background:var(--c4)}
.brush-row{display:flex;gap:8px;align-items:center;margin:12px 0 0;flex-wrap:wrap}
.brush-label{font-size:11px;color:var(--muted)}
.bsq{width:22px;height:22px;border-radius:5px;cursor:pointer;border:2px solid transparent;transition:transform .18s,border-color .18s}
.bsq.sel{border-color:var(--text);transform:scale(1.2)}.bsq:hover{transform:scale(1.12)}
.quick{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.qbtn{border-radius:999px;border:1px solid var(--border);background:var(--glass2);padding:5px 12px;font-size:11px;cursor:pointer;color:var(--text);display:inline-flex;align-items:center;gap:5px;transition:transform .2s cubic-bezier(.4,0,.2,1),filter .2s}
.qbtn:hover{transform:scale(1.05);filter:brightness(1.1)}
.ic-fill{width:10px;height:10px;border-radius:2px;background:var(--c4);flex-shrink:0}
.ic-half{width:10px;height:10px;border-radius:2px;background:linear-gradient(90deg,var(--c2) 50%,var(--c0) 50%);flex-shrink:0}
.ic-dice{width:10px;height:10px;border-radius:2px;border:1.5px solid currentColor;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:1px;padding:1.5px;flex-shrink:0}
.ic-dice span{border-radius:50%;background:currentColor}
.ic-invert{width:10px;height:10px;border-radius:2px;background:linear-gradient(135deg,var(--c4) 50%,var(--c0) 50%);flex-shrink:0}
.ic-trash{width:10px;height:10px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:1px}
.ic-trash::before{content:"";width:10px;height:1.5px;background:currentColor;border-radius:1px}
.ic-trash::after{content:"";width:8px;height:7px;border:1.5px solid currentColor;border-top:none;border-radius:0 0 2px 2px}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.tab{border-radius:999px;border:1px solid var(--border);background:var(--glass2);padding:6px 13px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:transform .22s cubic-bezier(.4,0,.2,1),filter .22s}
.tab.on{background:rgba(57,211,83,.14);border-color:rgba(57,211,83,.30)}
.tab:hover{transform:scale(1.04);filter:brightness(1.08)}
.ic-pixel{display:grid;grid-template-columns:1fr 1fr;gap:1.5px;width:10px;height:10px;flex-shrink:0}
.ic-pixel span{border-radius:1px}
.ic-pixel span:nth-child(1){background:var(--c1)}.ic-pixel span:nth-child(2){background:var(--c3)}.ic-pixel span:nth-child(3){background:var(--c4)}.ic-pixel span:nth-child(4){background:var(--c2)}
.ic-today{width:10px;height:10px;border-radius:50%;border:1.5px solid currentColor;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ic-today::after{content:"";width:3px;height:3px;border-radius:50%;background:currentColor}
.ic-range{width:10px;height:8px;display:flex;flex-direction:column;justify-content:space-between;flex-shrink:0}
.ic-range span{height:1.5px;background:currentColor;border-radius:1px}
.ic-range span:first-child{width:100%}.ic-range span:last-child{width:65%}
.ic-random{width:10px;height:10px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.ic-random span{width:3px;height:3px;border-radius:50%;background:currentColor}
.icon-canvas{display:grid;grid-template-columns:repeat(4,5px);grid-template-rows:repeat(4,5px);gap:1.5px;flex-shrink:0}
.icon-canvas span{border-radius:1px}
.mode-bar{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.mode-btn{border-radius:999px;border:1px solid var(--border);background:var(--glass2);padding:6px 14px;font-size:12px;cursor:pointer;color:var(--muted);transition:all .2s}
.mode-btn.on{background:rgba(57,211,83,.14);border-color:rgba(57,211,83,.30);color:var(--text)}
.code-panel{padding:14px;border-radius:18px;border:1px solid rgba(57,211,83,.25);background:rgba(57,211,83,.06);margin-bottom:14px}
.code-panel label{font-size:11px;color:var(--green);display:block;margin-bottom:6px;font-weight:600}
.code-row{display:flex;gap:8px}
.code-row .input{flex:1}
.code-row .pill{white-space:nowrap;padding:8px 14px}
</style>
</head><body>
<div class="wrap">
<nav class="nav">
  <div class="brand">
    <div class="logo-icon"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div><div class="brand-title">绿油油</div><div class="brand-sub">By ZSFan</div></div>
  </div>
  <div class="nav-right">
    <div class="badge"><div class="dot" id="statusDot"></div><span id="statusText">就绪</span></div>
    <button class="pill" onclick="submitAction()">立即推送 <span style="display:inline-block;width:7px;height:7px;border-top:1.5px solid currentColor;border-right:1.5px solid currentColor;transform:rotate(45deg)"></span></button>
    <a href="/docs" class="pill">文档</a>
  </div>
</nav>

<div class="hero">
  <div class="card">
    <div class="card-title"><div class="icon-canvas" id="canvasIcon"></div>涂抹模式</div>
    <div class="pg-wrap"><div class="pg" id="pg"></div></div>
    <div class="brush-row">
      <span class="brush-label">画笔强度：</span>
      <div id="brushBar"></div>
      <span id="brushVal" class="brush-label" style="min-width:28px"></span>
    </div>
    <div class="quick">
      <button class="qbtn" onclick="clearAll()"><span class="ic-trash"></span>清空</button>
      <button class="qbtn" onclick="fillAll(4)"><span class="ic-fill"></span>填满</button>
      <button class="qbtn" onclick="fillAll(2)"><span class="ic-half"></span>半色</button>
      <button class="qbtn" onclick="randomFill()"><span class="ic-dice"><span></span><span></span><span></span><span></span></span>随机</button>
      <button class="qbtn" onclick="invertAll()"><span class="ic-invert"></span>反色</button>
    </div>
  </div>

  <div class="card">
    <div class="card-title"><span class="icon-gear"></span>配置 &amp; 参数</div>
    <div class="mode-bar">
      <span style="font-size:11px;color:var(--muted)">使用方式：</span>
      <button class="mode-btn on" id="btnModeUser" onclick="switchUseMode('user')">配置</button>
      <button class="mode-btn" id="btnModeCode" onclick="switchUseMode('code')">授权码模式</button>
    </div>

    <div id="codePanelWrap" style="display:none">
      <div class="code-panel">
        <label>授权码</label>
        <div class="code-row">
          <input id="iAccessCode" class="input" type="password" placeholder="授权码"/>
          <button class="pill" onclick="saveCode()">记住</button>
        </div>
      </div>
    </div>

    <div id="userConfigWrap">
      <div class="row2">
        <div class="field"><label>GitHub Token</label><input id="iToken" class="input" type="password" placeholder="ghp_xxxx"/></div>
        <div class="field"><label>GitHub 用户名</label><input id="iOwner" class="input" placeholder="用户名"/></div>
      </div>
      <div class="gap8"></div>
      <div class="row2">
        <div class="field"><label>仓库名</label><input id="iRepo" class="input" placeholder="仓库名"/></div>
        <div class="field"><label>Workflow 文件名</label><input id="iWorkflow" class="input" placeholder="auto.yml"/></div>
      </div>
      <div class="gap8"></div>
      <div style="display:flex;justify-content:flex-end">
        <button class="pill" onclick="saveCookie()" style="font-size:11px">保存到 Cookie</button>
        <button class="pill" onclick="clearCookie()" style="font-size:11px;margin-left:6px;color:var(--muted)">清除</button>
      </div>
      <div class="divider"></div>
    </div>

    <div class="tabs" id="tabs">
      <div class="tab on" data-m="pixel"><span class="ic-pixel"><span></span><span></span><span></span><span></span></span>像素画</div>
      <div class="tab" data-m="today"><span class="ic-today"></span>仅今天</div>
      <div class="tab" data-m="range"><span class="ic-range"><span></span><span></span></span>日期范围</div>
      <div class="tab" data-m="random"><span class="ic-random"><span></span><span></span><span></span></span>随机模式</div>
    </div>

    <div class="row2">
      <div class="field"><label>起始周日</label><input id="iBase" class="input" style="font-variant-numeric:tabular-nums" placeholder="YYYY-MM-DD"/></div>
      <div class="field"><label>强度上限（1–10）</label><input id="iCap" class="input" value="4"/></div>
    </div>
    <div class="gap8"></div>
    <div class="row2">
      <div class="field"><label>开始日期</label><input id="iStart" class="input" placeholder="YYYY-MM-DD"/></div>
      <div class="field"><label>结束日期</label><input id="iEnd" class="input" placeholder="YYYY-MM-DD"/></div>
    </div>
    <div class="gap8"></div>
    <div class="row2">
      <div class="field"><label>随机上限（0–10）</label><input id="iRand" class="input" value="4"/></div>
      <div class="field"><label>&nbsp;</label><label class="ck-wrap"><input id="iSkip" type="checkbox"/>跳过周末</label></div>
    </div>
    <div class="gap12"></div>
    <button class="btn" id="btnMain" onclick="rippleAndSubmit(event)"><span class="ic-rocket"></span>推送到 GitHub Actions</button>
    <div id="toast" class="toast"></div>
  </div>
</div>
</div>

<script>
const W=52,H=7;
let mode='pixel',brush=2,painting=false,paintVal=null,useMode='user';
const state=Array.from({length:W},()=>new Uint8Array(H));

function setCookie(k,v,days=365){document.cookie=k+'='+encodeURIComponent(v)+';max-age='+(days*86400)+';path=/;SameSite=Lax';}
function getCookie(k){const m=document.cookie.match('(?:^|; )'+k+'=([^;]*)');return m?decodeURIComponent(m[1]):'';}
function delCookie(k){document.cookie=k+'=;max-age=0;path=/';}
function loadCookie(){
  document.getElementById('iToken').value   =getCookie('gh_token')   ||'';
  document.getElementById('iOwner').value   =getCookie('gh_owner')   ||'';
  document.getElementById('iRepo').value    =getCookie('gh_repo')    ||'';
  document.getElementById('iWorkflow').value=getCookie('gh_workflow')||'';
  const code=getCookie('access_code');
  if(code) document.getElementById('iAccessCode').value=code;
  const savedMode=getCookie('use_mode');
  if(savedMode) switchUseMode(savedMode,false);
}
function saveCookie(){
  setCookie('gh_token',   document.getElementById('iToken').value.trim());
  setCookie('gh_owner',   document.getElementById('iOwner').value.trim());
  setCookie('gh_repo',    document.getElementById('iRepo').value.trim());
  setCookie('gh_workflow',document.getElementById('iWorkflow').value.trim());
  toast('配置已保存到 Cookie','succ');
}
function clearCookie(){
  ['gh_token','gh_owner','gh_repo','gh_workflow'].forEach(delCookie);
  ['iToken','iOwner','iRepo','iWorkflow'].forEach(id=>{document.getElementById(id).value='';});
  toast('Cookie 已清除');
}
function saveCode(){
  const c=document.getElementById('iAccessCode').value.trim();
  if(!c){toast('请输入授权码','fail');return;}
  setCookie('access_code',c);toast('授权码已记住，下次自动使用','succ');
}
function switchUseMode(m,save=true){
  useMode=m;
  document.getElementById('btnModeUser').classList.toggle('on',m==='user');
  document.getElementById('btnModeCode').classList.toggle('on',m==='code');
  document.getElementById('userConfigWrap').style.display=m==='user'?'block':'none';
  document.getElementById('codePanelWrap').style.display =m==='code'?'block':'none';
  if(save) setCookie('use_mode',m);
}
function buildCanvasIcon(){
  const el=document.getElementById('canvasIcon');if(!el)return;
  const lvls=['var(--c0)','var(--c1)','var(--c2)','var(--c3)','var(--c4)'];
  const pat=[4,2,1,0,3,1,2,4,3,1,0,2,3,4,1,0];
  el.innerHTML=pat.map(v=>'<span style="background:'+lvls[v]+'"></span>').join('');
}
function buildBrushBar(){
  const bb=document.getElementById('brushBar');bb.innerHTML='';
  bb.style.cssText='display:flex;gap:5px;align-items:center';
  const cl=['#ebedf0','#9be9a8','#40c463','#30a14e','#216e39'],cd=['#161b22','#0e4429','#006d32','#26a641','#39d353'];
  const dark=matchMedia('(prefers-color-scheme:dark)').matches;
  for(let i=0;i<=4;i++){
    const d=document.createElement('div');d.className='bsq'+(i===brush?' sel':'');
    d.style.background=dark?cd[i]:cl[i];
    d.addEventListener('click',()=>{brush=i;buildBrushBar();});bb.appendChild(d);
  }
  document.getElementById('brushVal').textContent='×'+brush;
}
function getBaseSunday(){
  const v=document.getElementById('iBase').value.trim();
  if(v){const d=new Date(v+'T00:00:00');if(!isNaN(d))return d;}
  const jan1=new Date(new Date().getFullYear(),0,1);
  jan1.setDate(jan1.getDate()-jan1.getDay());
  return jan1;
}
function buildGrid(){
  const pg=document.getElementById('pg');pg.innerHTML='';
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const d=document.createElement('div');d.className='cell l'+state[x][y];d.dataset.x=x;d.dataset.y=y;pg.appendChild(d);
  }
}
function setCell(x,y,v){
  state[x][y]=Math.max(0,Math.min(4,v));
  const el=document.getElementById('pg').children[y*W+x];if(el)el.className='cell l'+state[x][y];
}
document.addEventListener('mousedown',e=>{
  const c=e.target.closest('.cell');if(!c)return;painting=true;paintVal=e.shiftKey?0:brush;
  setCell(+c.dataset.x,+c.dataset.y,paintVal);e.preventDefault();
});
document.addEventListener('mouseup',()=>{painting=false;paintVal=null;});
document.addEventListener('mousemove',e=>{if(!painting||paintVal===null)return;const c=e.target.closest('.cell');if(!c)return;setCell(+c.dataset.x,+c.dataset.y,paintVal);});
document.addEventListener('dblclick',e=>{const c=e.target.closest('.cell');if(!c)return;setCell(+c.dataset.x,+c.dataset.y,0);});
document.getElementById('pg').addEventListener('wheel',e=>{e.preventDefault();brush=Math.max(0,Math.min(4,brush+(e.deltaY<0?1:-1)));buildBrushBar();},{passive:false});
function clearAll(){for(let x=0;x<W;x++)for(let y=0;y<H;y++)setCell(x,y,0);}
function fillAll(v){for(let x=0;x<W;x++)for(let y=0;y<H;y++)setCell(x,y,v);}
function randomFill(){for(let x=0;x<W;x++)for(let y=0;y<H;y++)setCell(x,y,Math.floor(Math.random()*5));}
function invertAll(){for(let x=0;x<W;x++)for(let y=0;y<H;y++)setCell(x,y,4-state[x][y]);}
document.getElementById('tabs').addEventListener('click',e=>{
  const t=e.target.closest('.tab');if(!t)return;mode=t.dataset.m;
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));t.classList.add('on');
});
function setStatus(s,txt){document.getElementById('statusDot').className='dot '+s;document.getElementById('statusText').textContent=txt;}
function toast(msg,type=''){
  const el=document.getElementById('toast');el.textContent=msg;
  el.className='toast on'+(type?' '+type:'');setTimeout(()=>{el.className='toast';},5500);
}
async function submitAction(){
  const btn=document.getElementById('btnMain');btn.disabled=true;setStatus('run','推送中…');
  const payload={
    mode,baseSunday:document.getElementById('iBase').value.trim(),
    intensityCap:+document.getElementById('iCap').value||4,
    start:document.getElementById('iStart').value.trim(),end:document.getElementById('iEnd').value.trim(),
    randomMax:+document.getElementById('iRand').value||4,
    skipWeekends:document.getElementById('iSkip').checked,
    grid:Array.from({length:W},(_,x)=>Array.from(state[x]))
  };
  if(useMode==='code'){
    const code=document.getElementById('iAccessCode').value.trim();
    if(!code){setStatus('err','未填授权码');toast('请输入授权码','fail');btn.disabled=false;return;}
    payload.useAccessCode=true;payload.accessCode=code;
  } else {
    payload.useAccessCode=false;
    payload.ghToken   =document.getElementById('iToken').value.trim();
    payload.ghOwner   =document.getElementById('iOwner').value.trim();
    payload.ghRepo    =document.getElementById('iRepo').value.trim();
    payload.ghWorkflow=document.getElementById('iWorkflow').value.trim()||'auto.yml';
    payload.ghRef     ='main';
    if(!payload.ghToken||!payload.ghOwner||!payload.ghRepo){
      setStatus('err','配置不完整');toast('请填写完整的 GitHub 配置','fail');btn.disabled=false;return;
    }
  }
  try{
    const r=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json().catch(()=>({ok:false,error:'响应解析失败'}));
    if(!r.ok||!j.ok){setStatus('err','触发失败');toast('触发失败：'+(j.detail||j.error||'HTTP '+r.status),'fail');}
    else{setStatus('ok','触发成功');toast('GitHub Actions 已触发，贡献图约 1–2 分钟后更新。','succ');}
  }catch(err){setStatus('err','网络错误');toast('网络错误：'+err.message,'fail');}
  finally{btn.disabled=false;setTimeout(()=>setStatus('','就绪'),6000);}
}
function rippleAndSubmit(e){
  const b=document.getElementById('btnMain'),r=document.createElement('span');r.className='ripple';
  const rect=b.getBoundingClientRect();r.style.left=(e.clientX-rect.left)+'px';r.style.top=(e.clientY-rect.top)+'px';
  b.appendChild(r);setTimeout(()=>r.remove(),700);submitAction();
}
(function(){
  const jan1=new Date(new Date().getFullYear(),0,1);
  jan1.setDate(jan1.getDate()-jan1.getDay());
  document.getElementById('iBase').value=jan1.toISOString().slice(0,10);
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{buildBrushBar();buildCanvasIcon();});
  buildCanvasIcon();buildBrushBar();buildGrid();
  loadCookie();
})();
</script>
</body></html>`; }

function renderDocs() { return `<!doctype html>
<html lang="zh-Hans"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>使用文档 — 绿油油</title>
<style>
${sharedCSS()}
.docs-wrap{max-width:760px;margin:0 auto;padding:22px 16px 64px}
.step-list{list-style:none;display:flex;flex-direction:column;gap:12px;margin-top:4px}
.step{display:flex;gap:14px;align-items:flex-start}
.step-num{flex-shrink:0;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#2ea043,#3fb950);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(46,160,67,.35);margin-top:2px}
.step-body{flex:1}
.step-title{font-size:13px;font-weight:700;margin-bottom:3px}
.step-desc{font-size:12px;color:var(--muted);line-height:1.7}
code{background:var(--glass2);border:1px solid var(--border);border-radius:6px;padding:1px 7px;font-size:11px;font-family:'SF Mono',Menlo,Consolas,monospace;color:var(--green)}
.tip{border-radius:14px;border:1px solid rgba(57,211,83,.25);background:rgba(57,211,83,.06);padding:12px 16px;font-size:12px;color:var(--muted);line-height:1.7;margin-top:12px}
.tip strong{color:var(--green)}
.warn-tip{border-radius:14px;border:1px solid rgba(248,177,51,.25);background:rgba(248,177,51,.06);padding:12px 16px;font-size:12px;color:var(--muted);line-height:1.7;margin-top:12px}
.warn-tip strong{color:#e3b341}
.big-btn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;border:none;background:linear-gradient(135deg,#2ea043,#3fb950);color:#fff;padding:12px 24px;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none;box-shadow:0 4px 20px rgba(46,160,67,.35);transition:transform .25s,filter .25s;margin-top:8px}
.big-btn:hover{transform:scale(1.04);filter:brightness(1.1)}
.fork-icon{width:14px;height:14px;flex-shrink:0;position:relative}
.fork-icon::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:6px;height:6px;border-radius:50%;border:2px solid #fff}
.fork-icon::after{content:"";position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:6px;height:6px;border-radius:50%;border:2px solid #fff}
.fork-line{position:absolute;left:50%;top:6px;width:2px;height:calc(100% - 12px);background:#fff;transform:translateX(-50%)}
.mode-card{border-radius:18px;border:1px solid var(--border);background:var(--glass2);padding:14px 16px;margin-top:8px}
.mode-card-title{font-size:13px;font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:8px}
.mode-card-desc{font-size:12px;color:var(--muted);line-height:1.7}
.dot-green{width:8px;height:8px;border-radius:50%;background:#39d353;flex-shrink:0}
</style>
</head><body>
<div class="docs-wrap">
<nav class="nav">
  <div class="brand">
    <div class="logo-icon"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div><div class="brand-title">绿油油</div><div class="brand-sub">By ZSFan</div></div>
  </div>
  <div class="nav-right"><a href="/" class="pill">返回主页</a></div>
</nav>

<div class="card" style="margin-bottom:16px">
  <div class="card-title">使用方式</div>
  <div class="mode-card">
    <div class="mode-card-title"><span class="dot-green"></span>配置模式</div>
    <div class="mode-card-desc">Fork 本项目仓库，填入自己的 GitHub Token 和仓库信息，完全由自己控制。</div>
  </div>
</div>

<div class="card" style="margin-bottom:16px">
  <div class="card-title">使用流程</div>
  <ul class="step-list">
    <li class="step">
      <div class="step-num">1</div>
      <div class="step-body">
        <div class="step-title">Fork 仓库</div>
        <div class="step-desc">点击下方按钮 Fork 本项目到你的 GitHub 账号下。</div>
        <a href="https://github.com/ZhangShengFan/GreenWall/fork" target="_blank" class="big-btn">
          <span class="fork-icon"><span class="fork-line"></span></span>
          Fork ZhangShengFan/GreenWall
        </a>
      </div>
    </li>
    <li class="step">
      <div class="step-num">2</div>
      <div class="step-body">
        <div class="step-title">创建 GitHub Token</div>
        <div class="step-desc">
          前往 <a href="https://github.com/settings/tokens/new" target="_blank" style="color:var(--green)">GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)</a>，<br/>
          勾选权限：<code>repo</code> + <code>workflow</code>，生成后复制保存。
        </div>
      </div>
    </li>
    <li class="step">
      <div class="step-num">3</div>
      <div class="step-body">
        <div class="step-title">填写配置</div>
        <div class="step-desc">
          回到主页，依次填入：<br/>
          <code>GitHub Token</code> — 刚才生成的 Token<br/>
          <code>GitHub 用户名</code> — 你的 GitHub 用户名<br/>
          <code>仓库名</code> — Fork 后的仓库名，默认为 <code>GreenWall</code><br/>
          <code>Workflow 文件名</code> — 默认填 <code>auto.yml</code><br/>
          填写完毕后点击 <code>保存到 Cookie</code>，下次访问自动填入。
        </div>
      </div>
    </li>
    <li class="step">
      <div class="step-num">4</div>
      <div class="step-body">
        <div class="step-title">开启 Actions 权限</div>
        <div class="step-desc">
          进入你 Fork 的仓库 → <code>Settings</code> → <code>Actions</code> → <code>General</code>，<br/>
          将 <code>Workflow permissions</code> 设置为 <code>Read and write permissions</code>，保存。
        </div>
      </div>
    </li>
    <li class="step">
      <div class="step-num">5</div>
      <div class="step-body">
        <div class="step-title">涂抹 &amp; 推送</div>
        <div class="step-desc">在画布上涂抹想要的图案，选择参数后点击 <code>推送到 GitHub Actions</code>，等待 1–2 分钟贡献图即会更新。</div>
      </div>
    </li>
  </ul>
  <div class="warn-tip">
    <strong>注意</strong>：GitHub Token 属于敏感信息，Token 仅存储在你自己浏览器的 Cookie 中，不会上传到服务端。请勿在公共设备上使用。
  </div>
</div>

<div class="card">
  <div class="card-title">推送参数说明</div>
  <ul class="step-list">
    <li class="step">
      <div class="step-num">1</div>
      <div class="step-body"><div class="step-title">涂抹模式</div><div class="step-desc">在画布上手动涂抹图案，0 格 = 不提交，1–4 格 = 对应提交次数（颜色深浅）。需设置 <code>起始周日</code> 与 <code>强度上限</code>。</div></div>
    </li>
    <li class="step">
      <div class="step-num">2</div>
      <div class="step-body"><div class="step-title">仅今天</div><div class="step-desc">仅对今天提交指定次数的记录，快速刷新当天贡献。</div></div>
    </li>
    <li class="step">
      <div class="step-num">3</div>
      <div class="step-body"><div class="step-title">日期范围</div><div class="step-desc">对指定起止日期内每天均匀提交，可开启 <code>跳过周末</code>。</div></div>
    </li>
    <li class="step">
      <div class="step-num">4</div>
      <div class="step-body"><div class="step-title">随机模式</div><div class="step-desc">对指定日期范围内每天随机提交 0 到上限次数，让贡献图看起来更自然。</div></div>
    </li>
  </ul>
  <div class="tip">
    <strong>提示</strong>：强度上限建议设为 4，对应 GitHub 贡献图最深色。设置过高无额外效果，只会增加 Actions 运行时间。
  </div>
</div>

</div>
</body></html>`; }

function renderAdmin() { return `<!doctype html>
<html lang="zh-Hans"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>配置管理 — 绿油油</title>
<style>
${sharedCSS()}
.admin-wrap{max-width:560px;margin:0 auto;padding:22px 16px 48px}
</style>
</head><body>
<div class="admin-wrap">
<nav class="nav">
  <div class="brand">
    <div class="logo-icon"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div><div class="brand-title">配置管理</div><div class="brand-sub">By ZSFan / Admin</div></div>
  </div>
  <div class="nav-right"><a href="/" class="pill">返回主页</a></div>
</nav>

<div id="lockScreen">
  <div class="card" style="margin-top:40px">
    <div class="card-title"><span class="ic-lock"></span>验证管理密码</div>
    <div class="field">
      <label>管理密码（首次访问时将自动设置）</label>
      <input id="lockPwd" class="input" type="password" placeholder="输入密码后回车" autofocus/>
    </div>
    <div class="gap12"></div>
    <button class="btn" onclick="unlock()"><span class="ic-lock"></span>进入管理</button>
    <div id="lockToast" class="toast"></div>
  </div>
</div>

<div id="adminPanel" style="display:none">
  <div class="card">
    <div class="card-title"><span class="icon-gear"></span>服务端配置</div>
    <div class="section-title">GitHub 仓库</div>
    <div class="row2">
      <div class="field"><label>GitHub 用户名</label><input id="cfOwner" class="input" placeholder="ZhangShengFan"/></div>
      <div class="field"><label>仓库名</label><input id="cfRepo" class="input" placeholder="GreenWall"/></div>
    </div>
    <div class="gap8"></div>
    <div class="row2">
      <div class="field"><label>Workflow 文件名</label><input id="cfWorkflow" class="input" placeholder="auto.yml"/></div>
      <div class="field"><label>分支名</label><input id="cfRef" class="input" placeholder="main"/></div>
    </div>
    <div class="divider"></div>
    <div class="section-title">认证</div>
    <div class="field">
      <label>GitHub Token（Personal Access Token）<span id="tokenTag" class="tag warn">未设置</span></label>
      <input id="cfToken" class="input" type="password" placeholder="ghp_xxxx（留空则不修改）"/>
    </div>
    <div class="divider"></div>
    <div class="section-title">授权码（用于主页授权码模式）</div>
    <div class="field">
      <label>ACCESS_CODE<span id="codeTag" class="tag warn">未设置</span></label>
      <input id="cfCode" class="input" placeholder="你自己设定的授权码"/>
    </div>
    <div class="divider"></div>
    <div class="section-title">管理密码</div>
    <div class="row2">
      <div class="field"><label>新密码（留空不修改）</label><input id="cfPwd" class="input" type="password" placeholder="留空不修改"/></div>
      <div class="field"><label>确认新密码</label><input id="cfPwd2" class="input" type="password" placeholder="再次输入"/></div>
    </div>
    <div class="gap16"></div>
    <button class="btn" id="btnSave" onclick="saveConfig(event)"><span class="ic-save"></span>保存配置</button>
    <div id="adminToast" class="toast"></div>
  </div>
</div>
</div>

<script>
let currentPwd='';
function lToast(msg,t=''){const el=document.getElementById('lockToast');el.textContent=msg;el.className='toast on'+(t?' '+t:'');setTimeout(()=>{el.className='toast';},4000);}
function aToast(msg,t=''){const el=document.getElementById('adminToast');el.textContent=msg;el.className='toast on'+(t?' '+t:'');setTimeout(()=>{el.className='toast';},4000);}
async function unlock(){
  const pwd=document.getElementById('lockPwd').value;
  if(!pwd){lToast('请输入密码','fail');return;}
  const r=await fetch('/admin/get',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:pwd})});
  const j=await r.json().catch(()=>({ok:false,error:'解析失败'}));
  if(!r.ok||!j.ok){lToast('密码错误：'+(j.error||r.status),'fail');return;}
  currentPwd=pwd;
  const c=j.cfg;
  document.getElementById('cfOwner').value   =c.GH_OWNER||'';
  document.getElementById('cfRepo').value    =c.GH_REPO||'';
  document.getElementById('cfWorkflow').value=c.GH_WORKFLOW||'';
  document.getElementById('cfRef').value     =c.GH_REF||'';
  document.getElementById('cfCode').value    =c.ACCESS_CODE||'';
  const tt=document.getElementById('tokenTag');
  tt.textContent=c.hasToken?'已设置':'未设置';tt.className='tag'+(c.hasToken?'':' warn');
  const ct=document.getElementById('codeTag');
  ct.textContent=c.ACCESS_CODE?'已设置':'未设置';ct.className='tag'+(c.ACCESS_CODE?'':' warn');
  document.getElementById('lockScreen').style.display='none';
  document.getElementById('adminPanel').style.display='block';
}
document.getElementById('lockPwd').addEventListener('keydown',e=>{if(e.key==='Enter')unlock();});
async function saveConfig(e){
  const b=document.getElementById('btnSave');
  const rp=document.createElement('span');rp.className='ripple';
  const rect=b.getBoundingClientRect();rp.style.left=(e.clientX-rect.left)+'px';rp.style.top=(e.clientY-rect.top)+'px';
  b.appendChild(rp);setTimeout(()=>rp.remove(),700);
  const np=document.getElementById('cfPwd').value,np2=document.getElementById('cfPwd2').value;
  if(np&&np!==np2){aToast('两次密码不一致','fail');return;}
  b.disabled=true;
  const payload={
    password:currentPwd,
    GH_OWNER:   document.getElementById('cfOwner').value.trim(),
    GH_REPO:    document.getElementById('cfRepo').value.trim(),
    GH_WORKFLOW:document.getElementById('cfWorkflow').value.trim(),
    GH_REF:     document.getElementById('cfRef').value.trim(),
    GH_TOKEN:   document.getElementById('cfToken').value.trim(),
    ACCESS_CODE:document.getElementById('cfCode').value.trim(),
  };
  if(np) payload.ADMIN_PASSWORD=np;
  try{
    const r=await fetch('/admin',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const j=await r.json().catch(()=>({ok:false,error:'解析失败'}));
    if(!r.ok||!j.ok){aToast('保存失败：'+(j.error||r.status),'fail');}
    else{
      aToast('配置已保存','succ');
      if(np)currentPwd=np;
      document.getElementById('cfPwd').value='';document.getElementById('cfPwd2').value='';document.getElementById('cfToken').value='';
      document.getElementById('tokenTag').textContent='已设置';document.getElementById('tokenTag').className='tag';
      const code=document.getElementById('cfCode').value.trim();
      document.getElementById('codeTag').textContent=code?'已设置':'未设置';
      document.getElementById('codeTag').className='tag'+(code?'':' warn');
    }
  }catch(err){aToast('网络错误：'+err.message,'fail');}
  finally{b.disabled=false;}
}
</script>
</body></html>`; }
