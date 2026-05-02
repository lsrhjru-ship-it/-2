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
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  const user = verifyToken(event);
  if (!user) return { statusCode: 401, body: JSON.stringify({ error: '로그인이 필요합니다' }) };

  const method = event.httpMethod;

  // ── GET: 웹훅 목록 (URL은 마스킹해서 반환) ──
  if (method === 'GET') {
    const { data, error } = await supabase
      .from('webhooks')
      .select('id, name, channel, date, created_by')
      .eq('created_by', user.username)
      .order('date', { ascending: false });

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    // URL을 클라이언트에 절대 보내지 않음
    return { statusCode: 200, body: JSON.stringify({ webhooks: data }) };
  }

  // ── POST: 웹훅 추가 ──
  if (method === 'POST') {
    const { name, channel, url } = JSON.parse(event.body || '{}');
    if (!name || !url) return { statusCode: 400, body: JSON.stringify({ error: '이름과 URL은 필수입니다' }) };
    if (!url.startsWith('https://discord.com/api/webhooks/')) {
      return { statusCode: 400, body: JSON.stringify({ error: '올바른 Discord 웹훅 URL을 입력하세요' }) };
    }

    const { data, error } = await supabase.from('webhooks').insert({
      name, channel: channel || '#채널',
      url,  // 서버 DB에만 저장, 클라이언트에 절대 반환 안 함
      date: new Date().toLocaleDateString('ko'),
      created_by: user.username
    }).select('id, name, channel, date').single();

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 201, body: JSON.stringify({ webhook: data }) };
  }

  // ── DELETE: 웹훅 삭제 ──
  if (method === 'DELETE') {
    const { id } = JSON.parse(event.body || '{}');
    const { error } = await supabase
      .from('webhooks')
      .delete()
      .eq('id', id)
      .eq('created_by', user.username);  // 본인 것만 삭제 가능

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405 };
};
