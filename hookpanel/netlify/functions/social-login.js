const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  const { provider, email, name, picture, discordId, googleToken } = JSON.parse(event.body || '{}');
  if (!provider || !email) return { statusCode: 400, body: JSON.stringify({ error: '잘못된 요청입니다' }) };

  try {
    // ── 기존 유저 조회 ──
    let user = null;

    if (provider === 'google') {
      const { data } = await supabase.from('users').select('*').eq('google_email', email).single();
      user = data;
    } else if (provider === 'discord') {
      const { data } = await supabase.from('users').select('*').eq('discord_id', discordId).single();
      user = data;
    }

    // ── 신규 유저: 자동 가입 ──
    if (!user) {
      // username 충돌 방지: 이메일 앞부분 + 랜덤 4자리
      const base = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
      const username = base + '_' + Math.floor(1000 + Math.random() * 9000);

      const insertData = {
        username,
        email,
        role: 'user',
        display_name: name || username,
        join_date: new Date().toLocaleDateString('ko'),
        online: true,
        picture: picture || null,
        provider,
        pw_hash: null,
      };
      if (provider === 'google')  insertData.google_email = email;
      if (provider === 'discord') insertData.discord_id = discordId;

      const { data: newUser, error } = await supabase.from('users').insert(insertData).select('*').single();
      if (error) return { statusCode: 500, body: JSON.stringify({ error: '가입 실패: ' + error.message }) };
      user = newUser;
    } else {
      // 기존 유저: 온라인 상태 + picture 업데이트
      await supabase.from('users').update({ online: true, picture: picture || user.picture }).eq('id', user.id);
    }

    // ── JWT 발급 ──
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          email: user.email,
          role: user.role,
          picture: user.picture,
          provider: user.provider,
        }
      })
    };

  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: '서버 오류: ' + e.message }) };
  }
};
