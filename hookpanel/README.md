# HookPanel v3.0 - 배포 가이드

## 변경된 보안 구조

| 항목 | 이전 (F12에 노출) | 이후 (서버에만 존재) |
|------|-----------------|-------------------|
| 관리자 비밀번호 | ❌ 코드에 평문 | ✅ bcrypt 해시, DB에만 저장 |
| 웹훅 URL | ❌ localStorage에 저장 | ✅ Supabase DB에만 저장, 클라이언트 전달 안 함 |
| 로그인 로직 | ❌ 브라우저에서 실행 | ✅ Netlify Function 서버에서 실행 |
| 어드민 체크 | ❌ JS 변수로 체크 | ✅ 서버에서 JWT role 검증, 없으면 404 반환 |
| API 키 | ❌ 코드에 노출 | ✅ Netlify 환경변수에만 저장 |
| 인증 토큰 | ❌ localStorage | ✅ sessionStorage (탭 닫으면 삭제) |

---

## 배포 순서

### 1단계: Supabase 설정 (무료)
1. https://supabase.com 가입
2. 새 프로젝트 생성
3. SQL Editor에서 `supabase_schema.sql` 전체 실행
4. 관리자 계정 비밀번호 해시 생성:
   ```
   node -e "const b=require('bcryptjs'); b.hash('YOUR_PASSWORD',12).then(console.log)"
   ```
5. supabase_schema.sql 마지막 INSERT의 `$2a$12$REPLACE_THIS_WITH_BCRYPT_HASH` 부분을 위 결과로 교체 후 실행
6. Settings > API에서 `URL`과 `service_role` 키 복사

### 2단계: Netlify 배포 (무료)
1. https://netlify.com 가입
2. GitHub에 이 폴더 push (또는 Netlify에 폴더 직접 드래그)
3. Site Settings > Environment Variables에서 `.env.example` 항목들 입력
4. Deploy!

### 3단계: EmailJS 설정 (무료, 월 200건)
- EmailJS 무료 플랜은 private key 없이 사용 가능
- register.js에서 emailjs.send() 파라미터 조정 필요
- 또는 **Resend** (무료 월 3000건) 추천:
  ```
  npm install resend
  // register.js에서 emailjs 대신 resend 사용
  ```

### 4단계: Google OAuth 설정
1. Google Cloud Console > OAuth 2.0
2. Authorized JavaScript Origins에 `https://your-site.netlify.app` 추가
3. index.html의 `window.__GOOGLE_CLIENT_ID__` 설정을 위해
   netlify/functions/config.js 만들거나 HTML에 직접 입력

---

## 파일 구조
```
hookpanel/
├── public/
│   └── index.html          ← 프론트엔드 (민감정보 없음)
├── netlify/
│   └── functions/
│       ├── login.js         ← 로그인 (서버에서 비밀번호 검증)
│       ├── register.js      ← 회원가입 + OTP (서버에서 이메일 발송)
│       ├── webhooks.js      ← 웹훅 CRUD (URL 서버에만)
│       ├── send.js          ← 메시지 발송 (URL 서버에서만 사용)
│       └── admin.js         ← 어드민 API (서버에서 role 검증)
├── supabase_schema.sql      ← DB 스키마
├── netlify.toml             ← Netlify 설정
├── package.json
└── .env.example             ← 환경변수 예시
```

## F12 눌러도 보이는 것 (정상)
- HTML 구조, CSS 스타일
- Google/Discord Client ID (공개값, 문제 없음)
- API 엔드포인트 경로 (서버가 없으면 404)

## F12 눌러도 안 보이는 것 (보호됨)
- 비밀번호, 비밀번호 해시
- 웹훅 URL
- Supabase Service Key
- JWT Secret
- EmailJS Private Key
- 관리자 판별 로직
