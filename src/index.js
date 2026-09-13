export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // ==================== 1. 后台身份鉴权拦截 ====================
        if (url.pathname.startsWith('/admin')) {
            const isLogin = await checkLoginStatus(request, env);

            // 如果访问的是 admin 目录但未登录，且不是在尝试登录，强制返回登录 HTML 页面
            if (!isLogin && url.pathname !== '/admin/login-api') {
                // 如果是直接访问页面，返回内嵌的登录表单
                if (url.pathname === '/admin' || url.pathname === '/admin/' || url.pathname.endsWith('.html')) {
                    return new Response(getLoginHtml(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
                }
            }
            // 已登录，或者是静态资源请求，放行给静态资源引擎
            return await env.ASSETS.fetch(request);
        }

        // ==================== 2. 后端 API 接口路由 ====================
        // 公开接口：前端获取 KV 数据
        if (url.pathname === '/api/get-public-data') {
            const siteTitle = await env.DATA_KV.get("site_title") || "默认手表商城";
            const siteNotice = await env.DATA_KV.get("site_notice") || "欢迎光临！";
            return new Response(JSON.stringify({ siteTitle, siteNotice }), {
                headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" }
            });
        }

        // 后台接口：登录验证
        if (url.pathname === '/admin/login-api' && request.method === 'POST') {
            try {
                const { username, password } = await request.json();
                if (username === env.ADMIN_USER && password === env.ADMIN_PASSWORD) {
                    // 登录成功，生成 Cookie 凭证（此处使用简单的签名混淆，生产环境建议用标准的JWT）
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
                    "Set-Cookie": "admin_session=; Path=/; HttpOnly; Max-Age=0" // 清除 Cookie
                }
            });
        }

        // 后台接口：修改 KV 数据（必须校验登录状态）
        if (url.pathname === '/admin/update-kv' && request.method === 'POST') {
            if (!(await checkLoginStatus(request, env))) {
                return new Response("未授权", { status: 401 });
            }
            const { key, value } = await request.json();
            await env.DATA_KV.put(key, value);
            return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
        }

        // ==================== 3. 默认静态资源放行 ====================
        // 包含前端首页、assets图片等文件
        return await env.ASSETS.fetch(request);
    }
};

// 校验 Cookie 登录状态的辅助函数
async function checkLoginStatus(request, env) {
    const cookieHeader = request.headers.get("Cookie") || "";
    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')));
    const token = cookies['admin_session'];
    if (!token) return false;
    try {
        const decoded = atob(token);
        const [username, expireStr, secret] = decoded.split('|');
        if (secret === env.SESSION_SECRET && parseInt(expireStr) > Date.now()) {
            return true;
        }
    } catch (e) { }
    return false;
}

// 未登录时动态返回的独立登录 HTML 界面
function getLoginHtml() {
    return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>管理员登录</title>
    <style>
      body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f3f4f6; margin: 0; }
      .card { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 300px; }
      input { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
      button { width: 100%; padding: 10px; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>后台管理登录</h2>
      <input type="text" id="user" placeholder="用户名">
      <input type="password" id="pass" placeholder="密码">
      <button onclick="doLogin()">登录</button>
    </div>
    <script>
      async function doLogin() {
        const r = await fetch('/admin/login-api', {
          method: 'POST',
          body: JSON.stringify({ username: document.getElementById('user').value, password: document.getElementById('pass').value })
        });
        if (r.ok) { location.reload(); } else { alert('密码错误'); }
      }
    </script>
  </body>
  </html>`;
}
