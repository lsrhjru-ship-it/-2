const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const emailjs = require('@emailjs/nodejs');

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

    // EmailJS 서버 SDK로 발송 (API 키 서버에만 존재)
    try {
      await emailjs.send(
        process.env.EMAILJS_SERVICE,
        process.env.EMAILJS_TEMPLATE,
        { to_email: email, passcode: code, email: email },
        { publicKey: process.env.EMAILJS_KEY, privateKey: process.env.EMAILJS_PRIVATE_KEY }
      );
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: '이메일 발송 실패' }) };
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
