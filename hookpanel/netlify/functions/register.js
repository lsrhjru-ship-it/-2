const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  const { action, id, email, pw, otp } = JSON.parse(event.body || '{}');

  // ── 1. OTP 발송 ──
  if (action === 'send_otp') {
    if (!id || !email || !pw) return { statusCode: 400, body: JSON.stringify({ error: '모든 항목을 입력해주세요' }) };
    if (pw.length < 6) return { statusCode: 400, body: JSON.stringify({ error: '비밀번호는 6자 이상이어야 합니다' }) };

    // 중복 아이디 체크
    const { data: existing } = await supabase.from('users').select('id').eq('username', id).single();
    if (existing) return { statusCode: 409, body: JSON.stringify({ error: '이미 사용 중인 아이디입니다' }) };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const pw_hash_temp = await bcrypt.hash(pw, 12);

    // ── Supabase에 OTP 저장 (메모리 대신) ──
    await supabase.from('otp_store').delete().eq('email', email); // 기존 것 삭제
    const { error: storeErr } = await supabase.from('otp_store').insert({
      email, code, expires_at,
      username: id,
      pw_hash_temp,
    });
    if (storeErr) return { statusCode: 500, body: JSON.stringify({ error: 'OTP 저장 실패: ' + storeErr.message }) };

    // ── Resend 이메일 발송 ──
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'HookPanel <onboarding@resend.dev>',
        to: email,
        subject: '[HookPanel] 이메일 인증코드',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0a0b0f;color:#fff;border-radius:12px">
            <h2 style="color:#5865f2;margin-bottom:8px">HookPanel 이메일 인증</h2>
            <p style="color:#b9bbbe;margin-bottom:24px">아래 6자리 인증코드를 입력해주세요. 유효시간은 15분입니다.</p>
            <div style="background:#1a1d26;border:1px solid #2e3035;border-radius:10px;padding:24px;text-align:center;font-size:36px;font-weight:700;letter-spacing:12px;color:#fff">
              ${code}
            </div>
            <p style="color:#72767d;font-size:12px;margin-top:24px">본인이 요청하지 않은 경우 이 메일을 무시하세요.</p>
          </div>
        `
      });
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: '이메일 발송 실패: ' + e.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // ── 2. OTP 검증 + 가입 완료 ──
  if (action === 'verify_otp') {
    const { data: stored, error: fetchErr } = await supabase
      .from('otp_store').select('*').eq('email', email).single();

    if (fetchErr || !stored) return { statusCode: 400, body: JSON.stringify({ error: '인증 세션이 없습니다. 다시 시도해주세요' }) };
    if (new Date() > new Date(stored.expires_at)) {
      await supabase.from('otp_store').delete().eq('email', email);
      return { statusCode: 400, body: JSON.stringify({ error: '인증코드가 만료되었습니다' }) };
    }
    if (otp !== stored.code) return { statusCode: 401, body: JSON.stringify({ error: '인증코드가 올바르지 않습니다' }) };

    // ── 회원 가입 ──
    const { error: insertErr } = await supabase.from('users').insert({
      username: stored.username,
      pw_hash: stored.pw_hash_temp,
      email,
      role: 'user',
      display_name: stored.username,
      join_date: new Date().toLocaleDateString('ko'),
      online: true,
      provider: 'local',
    });

    if (insertErr) return { statusCode: 500, body: JSON.stringify({ error: '회원가입 실패: ' + insertErr.message }) };

    // OTP 레코드 삭제
    await supabase.from('otp_store').delete().eq('email', email);

    // JWT 발급
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { username: stored.username, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        user: { username: stored.username, displayName: stored.username, email, role: 'user' }
      })
    };
  }

  return { statusCode: 400, body: JSON.stringify({ error: '잘못된 요청' }) };
};
