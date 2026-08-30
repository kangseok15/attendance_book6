# 숭신고등학교 미래인재반 자율학습 출석부 관리 시스템

숭신고등학교 미래인재반(총 45명)의 아침 및 저녁 자율학습(야자)을 체계적으로 관리하고, 실시간 다중 기기(키오스크, 교사용 모바일, 관리자 PC) 동기화를 지원하는 풀스택 웹 애플리케이션입니다.

---

## 🌟 주요 기능

1. **실시간 다중 기기 동기화 (Cloud Firestore + Local Express)**
   - 키오스크(학생용 태블릿/PC), 교사용 스마트폰, 관리자 메인 PC 간 1초 이내 실시간 출결 동기화
   - 네트워크 단절 시에도 로컬 캐시와 서버 메모리 자동 복구 지원

2. **직관적인 출결 관리 모드**
   - **월간 출석부**: 1~3학년 전체 학생의 월별 출석부 그리드, 통계(출석/결석/출석률), 학원 요일 관리, 특이사항/사유 입력
   - **일별 빠른 체크**: 날짜별 학생 출결 현황 실시간 집계 및 일괄/개별 체크
   - **학생 명단 관리**: 45명 학생 데이터 관리, 비밀번호 설정, 엑셀/스프레드시트 연동
   - **스마트폰/키오스크 모드**: 학생이 직접 학번/번호 또는 터치로 간편 출결(아침/저녁) 체크

3. **데이터 백업 및 복원 센터**
   - 클라우드 Firestore 자동 동기화
   - JSON 및 CSV 파일 백업 / 즉시 복원 기능
   - 구글 스프레드시트 내보내기 연동

---

## 🚀 로컬 실행 방법 (Local Development)

### 1. 패키지 설치
```bash
npm install
```

### 2. 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:3000`으로 접속합니다.

### 3. 프로덕션 빌드 및 실행
```bash
npm run build
npm start
```

---

## 🛠️ 기술 스택 (Tech Stack)

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Motion (Framer Motion)
- **Backend**: Node.js, Express, tsx, esbuild
- **Database**: Google Cloud Firestore (Firebase)
- **Build Tool**: Vite

---

## 📁 프로젝트 구조

```
├── src/
│   ├── components/      # UI 컴포넌트 (출석부, 키오스크, 교사뷰, 통계 등)
│   ├── data/            # 초기 학생 45명 기본 데이터
│   ├── types/           # TypeScript 타입 및 인터페이스
│   ├── utils/           # Firestore 연동 및 API 동기화 유틸
│   ├── App.tsx          # 메인 애플리케이션 진입점
│   └── main.tsx         # React 렌더링 엔트리
├── server.ts            # 풀스택 Express 백엔드 서버
├── package.json         # 의존성 및 실행 스크립트 정의
└── README.md            # 프로젝트 안내 문서
```
