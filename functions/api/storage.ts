interface Env {
  CLOUDNAV_KV: any;
  PASSWORD: string;
}

// 未登录访问时，加密分类的密码会被替换成这个占位符（真实密码不会下发到浏览器）
const LOCKED_PLACEHOLDER = '__cloudnav_locked__';

// 统一的响应头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-auth-password, x-base-version',
};

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders };

const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const readData = async (env: Env): Promise<any | null> => {
  const raw = await env.CLOUDNAV_KV.get('app_data');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
};

// 处理 OPTIONS 请求（解决跨域预检）
export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

// GET: 获取数据
// 带正确的 x-auth-password 时返回完整数据；否则不返回加密分类里的链接和分类密码
export const onRequestGet = async (context: { request: Request; env: Env }) => {
  try {
    const { request, env } = context;
    const data = await readData(env);

    if (!data) {
      // 如果没有数据，返回空结构
      return json({ links: [], categories: [] });
    }

    const providedPassword = request.headers.get('x-auth-password');
    if (env.PASSWORD && providedPassword === env.PASSWORD) {
      return json(data);
    }

    const categories = Array.isArray(data.categories) ? data.categories : [];
    const lockedIds = new Set(categories.filter((c: any) => c && c.password).map((c: any) => c.id));
    const publicData = {
      ...data,
      categories: categories.map((c: any) => (c && c.password ? { ...c, password: LOCKED_PLACEHOLDER } : c)),
      links: (Array.isArray(data.links) ? data.links : []).filter((l: any) => !lockedIds.has(l.categoryId)),
      redacted: true,
    };
    return json(publicData);
  } catch (err) {
    return json({ error: 'Failed to fetch data' }, 500);
  }
};

// POST: 保存数据
// /api/storage?action=check  只验证管理密码，不写入
// /api/storage?action=unlock 用分类密码换取该分类的链接（不需要管理密码）
export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;
  const action = new URL(request.url).searchParams.get('action');

  if (action === 'unlock') {
    try {
      const { categoryId, password } = (await request.json()) as any;
      const data = await readData(env);
      const cat = data?.categories?.find((c: any) => c.id === categoryId);
      if (!cat || !cat.password || password !== cat.password) {
        return json({ error: 'Wrong password' }, 401);
      }
      const links = (data.links || []).filter((l: any) => l.categoryId === categoryId);
      return json({ success: true, links });
    } catch (err) {
      return json({ error: 'Failed to unlock' }, 500);
    }
  }

  // 1. 验证密码
  const providedPassword = request.headers.get('x-auth-password');
  const serverPassword = env.PASSWORD;

  if (!serverPassword) {
    return json({ error: 'Server misconfigured: PASSWORD not set' }, 500);
  }

  if (providedPassword !== serverPassword) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (action === 'check') {
    return json({ success: true });
  }

  // 2. 保存数据
  try {
    const body = (await request.json()) as any;
    const stored = await readData(env);
    const storedVersion = Number(stored?.version) || 0;

    // 云端在这个页面上次读取之后被别处（其他设备、浏览器扩展）改过，拒绝覆盖
    const baseHeader = request.headers.get('x-base-version');
    if (baseHeader !== null && storedVersion > (Number(baseHeader) || 0)) {
      return json({ error: 'Conflict', version: storedVersion }, 409);
    }

    // 保险：如果传上来的分类密码是占位符，换回云端保存的真实密码
    if (Array.isArray(body.categories)) {
      body.categories = body.categories.map((c: any) => {
        if (c && c.password === LOCKED_PLACEHOLDER) {
          const old = stored?.categories?.find((oc: any) => oc.id === c.id);
          return { ...c, password: old?.password || undefined };
        }
        return c;
      });
    }
    delete body.redacted;

    const newVersion = Math.max(Date.now(), storedVersion + 1);
    body.version = newVersion;

    // 将数据写入 KV
    await env.CLOUDNAV_KV.put('app_data', JSON.stringify(body));

    return json({ success: true, version: newVersion });
  } catch (err) {
    return json({ error: 'Failed to save data' }, 500);
  }
};
