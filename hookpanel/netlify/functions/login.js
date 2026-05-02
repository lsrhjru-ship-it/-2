const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service key는 서버에만 존재
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { id, pw } = JSON.parse(event.body || '{}');
  if (!id || !pw) return { statusCode: 400, body: JSON.stringify({ error: '아이디와 비밀번호를 입력해주세요' }) };

  // DB에서 유저 조회 (비밀번호는 bcrypt hash)
  const { data: user, error } = await supabase
    .from('users')
    .select('id, display_name, email, role, join_date, picture, provider')
    .eq('username', id)
    .single();

  if (error || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: '아이디 또는 비밀번호가 틀렸습니다' }) };
  }

  // bcrypt 비교
  const bcrypt = require('bcryptjs');
  const { data: pwRow } = await supabase
    .from('users')
    .select('pw_hash')
    .eq('username', id)
    .single();

  const valid = await bcrypt.compare(pw, pwRow.pw_hash);
  if (!valid) {
    return { statusCode: 401, body: JSON.stringify({ error: '아이디 또는 비밀번호가 틀렸습니다' }) };
  }

  // 온라인 상태 업데이트
  await supabase.from('users').update({ online: true }).eq('username', id);

  // JWT 세션 토큰 발급
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { id: user.id, username: id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      token,
      user: {
        id: user.id,
        username: id,
        displayName: user.display_name,
        email: user.email,
        role: user.role,
        picture: user.picture,
        provider: user.provider
      }
    })
  };
};
