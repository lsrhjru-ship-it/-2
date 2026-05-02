const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function verifyToken(event) {
  const auth = event.headers['authorization'] || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, process.env.JWT_SECRET); } catch { return null; }
}

exports.handler = async (event) => {
  const user = verifyToken(event);
  if (!user) return { statusCode: 401, body: JSON.stringify({ error: '로그인이 필요합니다' }) };

  // ── GET: 로그 목록 ──
  if (event.httpMethod === 'GET') {
    const query = user.role === 'admin'
      ? supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(200)
      : supabase.from('logs').select('*').eq('username', user.username).order('created_at', { ascending: false }).limit(100);

    const { data, error } = await query;
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ logs: data }) };
  }

  // ── DELETE: 로그 삭제 ──
  if (event.httpMethod === 'DELETE') {
    const query = user.role === 'admin'
      ? supabase.from('logs').delete().neq('id', 0)           // 어드민: 전체 삭제
      : supabase.from('logs').delete().eq('username', user.username); // 일반: 본인 것만

    const { error } = await query;
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405 };
};
