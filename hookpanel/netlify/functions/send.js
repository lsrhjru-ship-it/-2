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
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  const user = verifyToken(event);
  if (!user) return { statusCode: 401, body: JSON.stringify({ error: '로그인이 필요합니다' }) };

  const { webhookId, content, username, avatar_url, embeds } = JSON.parse(event.body || '{}');
  if (!webhookId) return { statusCode: 400, body: JSON.stringify({ error: '웹훅을 선택해주세요' }) };

  // 서버에서 URL 조회 (클라이언트는 ID만 알고 URL은 모름)
  const { data: hook, error: hookError } = await supabase
    .from('webhooks')
    .select('url, name')
    .eq('id', webhookId)
    .eq('created_by', user.username)
    .single();

  if (hookError || !hook) return { statusCode: 404, body: JSON.stringify({ error: '웹훅을 찾을 수 없습니다' }) };

  // 서버에서 Discord API 호출 (URL이 클라이언트에 절대 노출 안 됨)
  const payload = {};
  if (content) payload.content = content;
  if (username) payload.username = username;
  if (avatar_url) payload.avatar_url = avatar_url;
  if (embeds && embeds.length) payload.embeds = embeds;

  const discordRes = await fetch(hook.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // 발송 로그 저장
  await supabase.from('logs').insert({
    username: user.username,
    hook_name: hook.name,
    message: content || '[임베드]',
    time: new Date().toLocaleTimeString('ko'),
    status: discordRes.ok || discordRes.status === 204 ? 'success' : 'fail'
  });

  if (discordRes.ok || discordRes.status === 204) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } else {
    return { statusCode: discordRes.status, body: JSON.stringify({ error: '발송 실패 (' + discordRes.status + ')' }) };
  }
};
