export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // ==================== 1. 后端开放 API 接口 ====================
        
        // 前端获取 KV 数据的公开接口
        if (url.pathname === '/api/get-public-data') {
            const siteTitle = await env.DATA_KV.get("site_title") || "KINGJOWATCH";
            const siteNotice = await env.DATA_KV.get("site_notice") || "站点加载中...";
            return new Response(JSON.stringify({ siteTitle, siteNotice }), {
                headers: { 
                    "Content-Type": "application/json; charset=utf-8", 
                    "Access-Control-Allow-Origin": "*" 
                }
            });
        }

        // ==================== 2. 后台管理安全接口 ====================

        // 后台接口：登录验证
        if (url.pathname === '/admin/login-api' && request.method === 'POST') {
            try {
                const { username, password } = await request.json();
                if (username === env.ADMIN_USER && password === env.ADMIN_PASSWORD) {
                    // 登录成功，生成安全凭证 Cookie（有效期 7 天）
                    const token = btoa(`${username}|${Date.now() + 86400000 * 7}|${env.SESSION_SECRET}`);
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
                    "Set-Cookie": "admin_session=; Path=/; HttpOnly; Max-Age=0" // 立即清除 Cookie
                }
            });
        }

        // 后台接口：修改 KV 数据（必须校验登录状态）
        if (url.pathname === '/admin/update-kv' && request.method === 'POST') {
            if (!(await checkLoginStatus(request, env))) {
                return new Response(JSON.stringify({ success: false, msg: "未授权访问" }), { status: 401 });
            }
            try {
                const { key, value } = await request.json();
                await env.DATA_KV.put(key, value);
                return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
            } catch (e) {
                return new Response(JSON.stringify({ success: false, msg: "参数错误" }), { status: 400 });
            }
        }

        // ==================== 3. 路由安全拦截 (核心修复) ====================
        
        // 当访问后台路由时，做身份校验
        if (url.pathname.startsWith('/admin')) {
            const isLogin = await checkLoginStatus(request, env);

            // 情况 A：访问后台，但尚未登录
            if (!isLogin) {
                // 如果请求的是后台 HTML 页面或者后台根路径，直接向浏览器渲染内嵌的登录表单
                if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname.endsWith('.html')) {
                    return new Response(getLoginHtml(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
                }
            }
            
            // 情况 B：已登录，或者请求的是后台的静态 css/js/图片 资源，放行给静态资产引擎处理
            return await env.ASSETS.fetch(request);
        }

        // ==================== 4. 默认前端静态资源放行 ====================
        // 包含主页 index.html 及其相关静态资产文件
        return await env.ASSETS.fetch(request);
    }
};

/**
 * 校验 Cookie 登录状态的辅助函数
 */
async function checkLoginStatus(request, env) {
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')));
    const token = cookies['admin_session'];
    if (!token) return false;
    try {
        const decoded = atob(token);
        const [username, expireStr, secret] = decoded.split('|');
        // 验证签名混淆串是否一致，且登录是否在有效期内
        if (secret === env.SESSION_SECRET && parseInt(expireStr) > Date.now()) {
            return true;
        }
    } catch (e) { }
    return false;
}

/**
 * 未登录时，动态回传给浏览器的独立登录 HTML 界面
 */
function getLoginHtml() {
    return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>管理员登录</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f3f4f6; margin: 0; }
      .card { background: white; padding: 35px 30px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05), 0 4px 6px -2px rgba(0,0,0,0.05); width: 320px; }
      h2 { margin: 0 0 20px 0; color: #1f2937; text-align: center; font-size: 22px; }
      label { font-size: 14px; color: #4b5563; font-weight: 500; }
      input { width: 100%; padding: 12px; margin: 8px 0 20px 0; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; transition: border 0.2s; }
      input:focus { outline: none; border-color: #2563eb; }
      button { width: 100%; padding: 12px; background: #2563eb; color: white; border: none; border-radius: 6px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
      button:hover { background: #1d4ed8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>后台管理登录</h2>
      <label>用户名</label>
      <input type="text" id="user" placeholder="请输入用户名">
      <label>密码</label>
      <input type="password" id="pass" placeholder="请输入密码">
      <button onclick="doLogin()">安全登录</button>
    </div>
    <script>
      async function doLogin() {
        const user = document.getElementById('user').value;
        const pass = document.getElementById('pass').value;
        if(!user || !pass) { alert('请填写完整的账号和密码'); return; }
        
        try {
          const r = await fetch('/admin/login-api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
          });
          if (r.ok) { 
            location.reload(); 
          } else { 
            const data = await r.json().catch(()=>({}));
            alert(data.msg || '密码或账号错误'); 
          }
        } catch(e) {
          alert('网络请求失败，请稍后重试');
        }
      }
    </script>
  </body>
  </html>`;
}
