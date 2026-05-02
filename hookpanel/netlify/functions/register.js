const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// 메모리에 임시 OTP 저장 (Supabase로도 가능)
const otpStore = {};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  const { action, id, email, pw, otp } = JSON.parse(event.body || '{}');

  // ── 1. OTP 발송 요청 ──
  if (action === 'send_otp') {
    if (!id || !email || !pw) return { statusCode: 400, body: JSON.stringify({ error: '모든 항목을 입력해주세요' }) };
    if (pw.length < 6) return { statusCode: 400, body: JSON.stringify({ error: '비밀번호는 6자 이상이어야 합니다' }) };

    // 중복 아이디 체크
    const { data: existing } = await supabase.from('users').select('id').eq('username', id).single();
    if (existing) return { statusCode: 409, body: JSON.stringify({ error: '이미 사용 중인 아이디입니다' }) };

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 15 * 60 * 1000;
    otpStore[email] = { code, expires, id, pw };  // 임시 저장

    // Resend로 이메일 발송 (API 키 서버에만 존재)
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'HookPanel <onboarding@resend.dev>',  // 도메인 없으면 이걸로 사용
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
    const stored = otpStore[email];
    if (!stored) return { statusCode: 400, body: JSON.stringify({ error: '인증 세션이 없습니다. 다시 시도해주세요' }) };
    if (Date.now() > stored.expires) {
      delete otpStore[email];
      return { statusCode: 400, body: JSON.stringify({ error: '인증코드가 만료되었습니다' }) };
    }
    if (otp !== stored.code) return { statusCode: 401, body: JSON.stringify({ error: '인증코드가 올바르지 않습니다' }) };

    // 비밀번호 해시화 후 DB 저장
    const pw_hash = await bcrypt.hash(stored.pw, 12);
    const { error } = await supabase.from('users').insert({
      username: stored.id,
      pw_hash,
      email,
      role: 'user',
      display_name: stored.id,
      join_date: new Date().toLocaleDateString('ko'),
      online: true
    });

    if (error) return { statusCode: 500, body: JSON.stringify({ error: '회원가입 실패: ' + error.message }) };
    delete otpStore[email];

    // JWT 발급
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { username: stored.id, role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        user: { username: stored.id, displayName: stored.id, email, role: 'user' }
      })
    };
  }

  return { statusCode: 400, body: JSON.stringify({ error: '잘못된 요청' }) };
};
