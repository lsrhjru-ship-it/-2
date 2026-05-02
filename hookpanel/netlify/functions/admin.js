const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function verifyAdmin(event) {
  const auth = event.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return null;  // 서버에서 role 검증
    return decoded;
  } catch { return null; }
}

exports.handler = async (event) => {
  const admin = verifyAdmin(event);
  if (!admin) {
    // 어드민 아닌 경우 404 반환 (엔드포인트 존재 자체도 숨김)
    return { statusCode: 404, body: 'Not Found' };
  }

  const method = event.httpMethod;
  const path = event.path.replace('/.netlify/functions/admin', '');

  // ── GET /admin/users: 전체 회원 목록 ──
  if (method === 'GET' && path === '/users') {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, display_name, email, role, join_date, online, provider')
      .order('join_date', { ascending: false });

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ users: data }) };
  }

  // ── GET /admin/stats: 전체 통계 ──
  if (method === 'GET' && path === '/stats') {
    const [{ count: totalUsers }, { count: onlineUsers }, { count: totalHooks }, { count: totalLogs }] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('online', true),
      supabase.from('webhooks').select('*', { count: 'exact', head: true }),
      supabase.from('logs').select('*', { count: 'exact', head: true })
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({ totalUsers, onlineUsers, totalHooks, totalLogs })
    };
  }

  // ── PATCH /admin/users/role: 역할 변경 ──
  if (method === 'PATCH' && path === '/users/role') {
    const { targetUsername, newRole } = JSON.parse(event.body || '{}');
    if (!['admin', 'user'].includes(newRole)) return { statusCode: 400, body: JSON.stringify({ error: '올바르지 않은 역할입니다' }) };
    if (targetUsername === admin.username) return { statusCode: 400, body: JSON.stringify({ error: '자신의 역할은 변경할 수 없습니다' }) };

    const { error } = await supabase.from('users').update({ role: newRole }).eq('username', targetUsername);
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 404 };
};
