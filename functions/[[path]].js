export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);

    // ==================== 1. 后端开放 API 接口 ====================
    
    // 公开接口：前台单页获取当前云端配置
    if (url.pathname === '/api/get-public-data') {
        const configRaw = await env.DATA_KV.get("admin_config") || "{}";
        const config = JSON.parse(configRaw);
        return new Response(JSON.stringify({
            siteTitle: config.siteTitle || "SULAN PEPTIDE",
            siteNotice: config.siteNotice || "系统正常运行",
            whatsappNumbers: config.whatsappNumbers || [],
            metaPixels: config.metaPixels || [],
            tiktokPixels: config.tiktokPixels || [],
            routingMode: config.routingMode || "Single",
            formEnabled: config.formEnabled !== false
        }), {
            headers: { 
                "Content-Type": "application/json; charset=utf-8", 
                "Access-Control-Allow-Origin": "*" 
            }
        });
    }

    // 后台接口：登录验证
    if (url.pathname === '/admin/login-api' && request.method === 'POST') {
        try {
            const { username, password } = await request.json();
            const adminUser = env.ADMIN_USER || "admin";
            const adminPass = env.ADMIN_PASSWORD || "admin123";
            const sessionSecret = env.SESSION_SECRET || "SulanPeptide-Admin-2026-Secret";

            if (username === adminUser && password === adminPass) {
                const token = btoa(`${username}|${Date.now() + 86400000 * 7}|${sessionSecret}`);
                return new Response(JSON.stringify({ success: true }), {
                    headers: {
                        "Content-Type": "application/json",
                        "Set-Cookie": `admin_session=${token}; Path=/; HttpOnly; Max-Age=604800; SameSite=Strict`
                    }
                });
            }
        } catch (e) { }
        return new Response(JSON.stringify({ success: false, msg: "账号或密码错误" }), { status: 401 });
    }

    // 后台接口：退出登录
    if (url.pathname === '/admin/logout-api') {
        return new Response(JSON.stringify({ success: true }), {
            headers: {
                "Content-Type": "application/json",
                "Set-Cookie": "admin_session=; Path=/; HttpOnly; Max-Age=0"
            }
        });
    }

    // 后台接口：更新完整的后台 KV 配置（必须校验登录状态）
    // 【核心修复】将路径统一变更为独立的绝对全局 API，彻底避免由于后台带 admin.html 后缀引发的 405 路由拦截
    if (url.pathname === '/api/update-kv-data' && request.method === 'POST') {
        if (!(await checkLoginStatus(request, env))) {
            return new Response(JSON.stringify({ success: false, msg: "未授权访问" }), { status: 401 });
        }
        try {
            const { config } = await request.json();
            // 集中将整个前端状态对象存入名为 "admin_config" 的 KV 键中
            await env.DATA_KV.put("admin_config", JSON.stringify(config));
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        } catch (e) {
            return new Response(JSON.stringify({ success: false, msg: "保存失败" }), { status: 500 });
        }
    }

    // ==================== 2. 后台路由安全拦截 ====================
    if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname === '/admin.html') {
        const isLogin = await checkLoginStatus(request, env);
        // 如果访问后台但未登录，强制渲染独立登录页面
        if (!isLogin) {
            return new Response(getLoginHtml(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
    }

    // ==================== 3. 默认静态资源放行 ====================
    return env.ASSETS.fetch(request);
}

// 校验 Cookie 登录状态的辅助函数
async function checkLoginStatus(request, env) {
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')));
    const token = cookies['admin_session'];
    if (!token) return false;
    try {
        const decoded = atob(token);
        const [username, expireStr, secret] = decoded.split('|');
        const sessionSecret = env.SESSION_SECRET || "SulanPeptide-Admin-2026-Secret";
        if (secret === sessionSecret && parseInt(expireStr) > Date.now()) {
            return true;
        }
    } catch (e) { }
    return false;
}

// 动态渲染：未登录时的独立登录表单页面
function getLoginHtml() {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sulan Peptide — Campaign Center</title><style>body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f9fafb; margin: 0; }.card { background: white; padding: 40px 30px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); width: 320px; }h2{text-align:center;color:#111827;font-size:22px;margin:0 0 8px 0;}p{text-align:center;color:#6b7280;margin:0 0 25px 0;font-size:14px;}label{font-size:13px;color:#374151;font-weight:600;}input { width: 100%; padding: 12px; margin: 6px 0 20px 0; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }button { width: 100%; padding: 12px; background: #111827; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 14px; }button:hover{background:#1f2937;}</style></head><body><div class="card"><h2>SULAN PEPTIDE</h2><p>Campaign Center · 管理后台</p><label>密码 / Password</label><input type="password" id="pass" placeholder="请输入管理员密码"><button onclick="doLogin()">登录 / Sign in</button></div><script>async function doLogin(){const r=await fetch('/admin/login-api',{method:'POST',body:JSON.stringify({username:'admin',password:document.getElementById('pass').value})});if(r.ok){location.reload();}else{alert('密码错误 / Incorrect Password');}}</script></body></html>`;
}
