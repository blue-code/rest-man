# RestMan - Postman-like API Client

RestMan은 Rust와 Tauri를 기반으로 한 경량 크로스플랫폼 API 테스팅 데스크탑 애플리케이션입니다. Electron 기반 도구의 무거운 메모리 사용 문제를 해결하고, 네이티브에 가까운 성능을 제공합니다.

## 주요 특징

- **경량 & 고성능**: Tauri + Rust로 구현하여 Electron 대비 메모리 사용량 대폭 절감
- **크로스플랫폼**: Windows, macOS, Linux 지원
- **HTTP 요청 전송**: GET, POST, PUT, PATCH, DELETE 등 모든 HTTP 메서드 지원
- **요청 커스터마이징**:
  - URL 파라미터 설정
  - 커스텀 헤더 추가
  - Request Body 작성 (JSON, XML 등)
  - **멀티파트 파일 업로드** (이미지, 문서 등)
- **OpenAPI 가져오기**: URL에서 OpenAPI 스펙 (JSON/YAML)을 가져와 자동으로 엔드포인트 생성
- **환경 변수**: `{{variable_name}}` 형식으로 URL과 Body에서 변수 사용 가능
- **히스토리 관리**: 이전 요청 자동 저장 및 재사용
- **응답 시각화**:
  - JSON 자동 포맷팅
  - 상태 코드, 응답 시간, 바디 크기 표시
  - 응답 헤더 확인
- **다크 테마 UI**: VS Code 스타일의 깔끔한 인터페이스

## 기술 스택

### 백엔드
- **Rust**: 고성능 시스템 프로그래밍 언어
- **Tauri**: 경량 데스크탑 애플리케이션 프레임워크
- **reqwest**: HTTP 클라이언트 라이브러리
- **SQLite (rusqlite)**: 로컬 데이터 저장

### 프론트엔드
- **React**: UI 라이브러리
- **TypeScript**: 타입 안정성
- **Vite**: 빠른 빌드 툴

## 사전 요구사항

프로젝트를 빌드하고 실행하기 위해서는 다음 도구들이 필요합니다:

### 1. Rust 설치

```bash
# macOS/Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows
# https://rustup.rs/ 에서 rustup-init.exe 다운로드 후 실행
```

### 2. Node.js 설치

Node.js 18 이상이 필요합니다.

```bash
# macOS (Homebrew 사용)
brew install node

# Windows
# https://nodejs.org/ 에서 설치 프로그램 다운로드

# 버전 확인
node --version
npm --version
```

### 3. 플랫폼별 추가 요구사항

#### macOS
```bash
# Xcode Command Line Tools
xcode-select --install
```

#### Windows
- Visual Studio C++ Build Tools
- WebView2 런타임 (Windows 10/11에 기본 포함)

#### Linux
```bash
# Debian/Ubuntu
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Fedora
sudo dnf install webkit2gtk3-devel.x86_64 \
    openssl-devel \
    curl \
    wget \
    libappindicator-gtk3 \
    librsvg2-devel

# Arch Linux
sudo pacman -S webkit2gtk \
    base-devel \
    curl \
    wget \
    openssl \
    appmenu-gtk-module \
    gtk3 \
    libappindicator-gtk3 \
    librsvg
```

### 4. Tauri CLI 설치

```bash
# npm을 통한 설치
cd webui
npm install

# 또는 cargo를 통한 전역 설치
cargo install tauri-cli
```

## 설치 및 실행

### 1. 의존성 설치

```bash
# 프론트엔드 의존성 설치
cd webui
npm install
cd ..
```

### 2. 개발 모드 실행

```bash
# webui 디렉토리에서 실행
cd webui
npm run dev
```

별도의 터미널에서 Tauri 개발 서버 실행:

```bash
# 프로젝트 루트에서 실행
cargo tauri dev
```

또는 한 번에 실행 (package.json에 스크립트 추가 후):

```bash
cd webui
npm run tauri dev
```

### 3. 프로덕션 빌드

```bash
# 프론트엔드 빌드
cd webui
npm run build

# Tauri 앱 빌드
cd ..
cargo tauri build
```

빌드된 애플리케이션은 다음 위치에 생성됩니다:
- **macOS**: `src-tauri/target/release/bundle/dmg/`
- **Windows**: `src-tauri/target/release/bundle/msi/`
- **Linux**: `src-tauri/target/release/bundle/deb/` 또는 `appimage/`

## 프로젝트 구조

```
restman/
├── src-tauri/              # Rust 백엔드
│   ├── src/
│   │   └── main.rs        # 메인 Rust 코드
│   ├── Cargo.toml         # Rust 의존성
│   ├── tauri.conf.json    # Tauri 설정
│   └── build.rs           # 빌드 스크립트
├── webui/                 # React 프론트엔드
│   ├── src/
│   │   ├── App.tsx        # 메인 React 컴포넌트
│   │   ├── main.tsx       # React 엔트리포인트
│   │   └── styles.css     # 스타일시트
│   ├── public/            # 정적 파일
│   ├── index.html         # HTML 템플릿
│   ├── package.json       # Node.js 의존성
│   ├── vite.config.ts     # Vite 설정
│   └── tsconfig.json      # TypeScript 설정
├── dist/                  # 빌드 산출물
└── README.md
```

## 사용 방법

### 기본 HTTP 요청

1. 상단 드롭다운에서 HTTP 메서드 선택 (GET, POST, PUT 등)
2. URL 입력창에 요청할 URL 입력
3. "Send" 버튼 클릭
4. 하단에서 응답 확인

### 헤더 추가

1. "Headers" 탭 클릭
2. "+ Add Header" 버튼으로 헤더 추가
3. Key와 Value 입력

### URL 파라미터 추가

1. "Params" 탭 클릭
2. "+ Add Parameter" 버튼으로 파라미터 추가
3. Key와 Value 입력 (자동으로 URL에 추가됨)

### Request Body 작성

1. "Body" 탭 클릭
2. 텍스트 영역에 요청 바디 입력 (JSON, XML 등)

### 환경 변수 사용

1. "Show Environment Variables" 버튼 클릭
2. 환경 변수 추가 (예: `api_key` = `your_secret_key`)
3. URL이나 Body에서 `{{api_key}}` 형식으로 사용

예시:
```
URL: https://api.example.com/users?token={{api_key}}
Body: {"username": "{{username}}", "email": "{{email}}"}
```

### 파일 업로드 (멀티파트)

1. "Files" 탭 클릭
2. "+ Add Files" 버튼 클릭하여 업로드할 파일 선택
3. 여러 파일 동시 선택 가능
4. Body 탭에서 추가 폼 필드 입력 가능 (JSON 형식)
5. "Send" 버튼으로 멀티파트 요청 전송

예시 (Body 탭):
```json
{
  "description": "Profile picture upload",
  "user_id": "12345"
}
```

### OpenAPI 스펙 가져오기

1. 상단 "Import OpenAPI" 버튼 클릭
2. OpenAPI 스펙 URL 입력 (JSON 또는 YAML)
   - 예: `https://petstore.swagger.io/v2/swagger.json`
3. "Import" 버튼 클릭
4. 가져온 엔드포인트 목록에서 원하는 엔드포인트 클릭
5. 자동으로 메서드와 경로가 설정됨

지원하는 OpenAPI 버전:
- OpenAPI 3.0
- OpenAPI 3.1

### 히스토리에서 요청 불러오기

왼쪽 사이드바의 히스토리 목록에서 이전 요청을 클릭하여 재실행할 수 있습니다.

## 개발 로드맵

### 현재 구현된 기능
- ✅ HTTP 요청 전송 (모든 메서드)
- ✅ 헤더/파라미터/바디 설정
- ✅ **멀티파트 파일 업로드**
- ✅ **OpenAPI 스펙 가져오기 (JSON/YAML)**
- ✅ 환경 변수 관리
- ✅ 요청 히스토리
- ✅ 응답 시각화

### 향후 계획
- ⬜ 요청 컬렉션 (폴더 구조로 요청 그룹화)
- ⬜ 프리-리퀘스트 스크립트 (JavaScript)
- ⬜ 테스트 스크립트 (응답 검증)
- ⬜ 파일 다운로드 (바이너리 응답 처리)
- ⬜ WebSocket 지원
- ⬜ GraphQL 지원
- ⬜ OAuth 2.0 인증 헬퍼
- ⬜ 데이터 가져오기/내보내기 (Postman 호환)
- ⬜ 자동 업데이트 기능

## 성능 비교

| 특징 | Electron (Postman) | Tauri (RestMan) |
|------|-------------------|-----------------|
| 설치 크기 | ~200MB | ~5-10MB |
| 메모리 사용 | 300-500MB | 50-100MB |
| 시작 시간 | 2-3초 | <1초 |
| 리소스 효율 | 낮음 | 높음 |

## 라이선스

MIT License

## 기여

버그 리포트와 기능 제안은 언제나 환영합니다!

## 문의

프로젝트 관련 문의사항은 이슈로 남겨주세요.
