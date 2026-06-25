# @gasio/mcp-server

## 🚀 100% 로컬 오프라인 AI 미디어 처리 MCP 서버 (Model Context Protocol Server)
**100% Private, Offline Local AI Image & Video Processing MCP Server for Claude, Cursor, and Gemini.**

[![npm version](https://badge.fury.io/js/%40gasio%2Fmcp-server.svg)](https://www.npmjs.com/package/@gasio/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

[Gasio Tools](https://tools.gasio.com) 생태계의 14종 이미지/미디어 처리 기능을 **Claude Desktop**, **Cursor**, **Gemini** 등 MCP를 지원하는 모든 AI 에이전트 및 IDE에서 100% 로컬 오프라인으로 사용할 수 있는 [Model Context Protocol](https://modelcontextprotocol.io) 서버입니다.

> 🔒 **100% Private & Secure**: 파일이 외부 서버에 절대 업로드되지 않습니다. 모든 AI 연산(배경 제거, 화질 개선, OCR 등)은 사용자의 컴퓨터 하드웨어 내부에서만 안전하게 처리됩니다. (Zero data upload, Zero egress).

---

## 📌 목차 (Table of Contents)
- [🛠️ 제공 도구 (14종)](#️-제공-도구-14종)
- [📦 설치 및 셋업](#-설치-및-셋업)
- [⚙️ Claude Desktop 연동 설정](#️-claude-desktop-연동-설정)
- [📋 도구별 사용 예시](#-도구별-사용-예시)
- [🔧 도구별 상세 파라미터](#-도구별-상세-파라미터)
- [🔒 보안 정책](#-보안-정책)
- [🌐 관련 서비스](#-관련-서비스)

---

## 🛠️ 제공 도구 (14종)

### 🎨 이미지 AI 처리 (Season 2)
| 도구 이름 | 설명 |
| :--- | :--- |
| `gasio_remove_background` | 인물/개체 배경을 AI로 제거 → 투명 PNG 저장 |
| `gasio_object_eraser` | 마스크 이미지 기반으로 특정 개체를 자연스럽게 지우기 (OpenCV Inpainting) |
| `gasio_image_upscaler` | 저화질 이미지를 RealESRGAN AI 모델로 2~4배 고화질 업스케일 |
| `gasio_image_resizer` | 이미지 크기 조정 (resize / cover / contain 모드, 비율 자동 유지) |
| `gasio_image_converter` | PNG ↔ JPEG ↔ WEBP ↔ BMP ↔ GIF 포맷 변환 |
| `gasio_favicon_generator` | 고해상도 이미지로 웹 표준 파비콘 세트 (ICO, PNG, WebManifest, ZIP) 생성 |
| `gasio_exif_cleaner` | JPEG EXIF/GPS 메타데이터 삭제 및 SEO용 메타데이터 주입 |

### 🎬 미디어 변환 & 편집 (Season 1)
| 도구 이름 | 설명 |
| :--- | :--- |
| `gasio_png_to_svg` | PNG/JPG 비트맵 이미지를 SVG 벡터 파일로 변환 |
| `gasio_video_to_gif` | MP4/MOV 동영상에서 지정 구간을 GIF 애니메이션으로 변환 |
| `gasio_audio_cut` | MP3/WAV/M4A 오디오 구간 편집 + 페이드인/페이드아웃 |
| `gasio_screenshot_mockup` | 스크린샷을 iPhone/MacBook/Browser 목업 프레임에 합성 |
| `gasio_image_to_text_ocr` | 이미지에서 텍스트 추출 (한국어/영어 OCR) |
| `gasio_qrcode_generator` | 텍스트/URL로 QR 코드 PNG 생성 (중앙 로고 합성 지원) |
| `gasio_css_generator` | Glassmorphism / Mesh Gradient CSS 코드 즉시 생성 |

---

## 📦 설치 및 셋업

### 1단계: 글로벌 설치

```bash
npm install -g @gasio/mcp-server
```

또는 npx로 바로 실행:

```bash
npx @gasio/mcp-server
```

### 2단계: AI 모델 자동 다운로드 (최초 1회)

OCR, 배경 제거, 화질 개선 도구는 AI 모델 파일이 필요합니다.

```bash
npx gasio-mcp-setup
```

> 이 명령은 다음 리소스를 `~/.gasio/` 디렉토리에 자동으로 다운로드합니다:
> - `~/.gasio/tesseract/eng.traineddata` — Tesseract 영어 모델
> - `~/.gasio/tesseract/kor.traineddata` — Tesseract 한국어 모델
> - `~/.gasio/models/realesrgan-x4.onnx` — RealESRGAN 업스케일 모델 (~67MB)
> - `~/.gasio/models/super-resolution.onnx` — Super Resolution 모델

---

## ⚙️ Claude Desktop 연동 설정

`claude_desktop_config.json` 파일에 다음을 추가하세요:

**macOS 경로:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows 경로:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "gasio": {
      "command": "npx",
      "args": ["-y", "@gasio/mcp-server"]
    }
  }
}
```

글로벌 설치 후 직접 node 실행을 원하는 경우:

```json
{
  "mcpServers": {
    "gasio": {
      "command": "node",
      "args": ["/절대경로/node_modules/@gasio/mcp-server/dist/src/index.js"]
    }
  }
}
```

---

## 📋 도구별 사용 예시

### 배경 제거
```
이미지 /Users/me/photo.jpg 에서 배경을 제거해서 /Users/me/output/photo-bg-removed.png 로 저장해줘
```
→ Claude가 `gasio_remove_background` 도구를 자동 호출

### OCR 텍스트 추출
```
/Users/me/screenshot.png 이미지에서 한국어 텍스트를 추출해줘
```
→ Claude가 `gasio_image_to_text_ocr` 도구를 `lang: "kor"` 옵션으로 호출

### QR 코드 생성
```
https://tools.gasio.com URL로 QR 코드를 만들어서 /Users/me/qr.png 에 저장해줘
```
→ Claude가 `gasio_qrcode_generator` 도구를 자동 호출

### 파비콘 세트 생성
```
/Users/me/logo.png 로 파비콘 세트를 /Users/me/favicon-output/ 에 만들어줘
```
→ Claude가 `gasio_favicon_generator` 도구로 `favicon.ico`, `apple-touch-icon.png`, `site.webmanifest` 등을 일괄 생성

---

## 🔧 도구별 상세 파라미터

<details>
<summary><b>gasio_remove_background</b> - 배경 제거</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 원본 이미지의 로컬 절대 경로 |
| `output_path` | string | ✅ | - | 저장할 투명 PNG 경로 |
| `model_preset` | `"small"` \| `"medium"` \| `"large"` | ❌ | `"medium"` | AI 모델 크기 |

</details>

<details>
<summary><b>gasio_object_eraser</b> - 개체 지우기</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 원본 이미지 경로 |
| `mask_path` | string | ✅ | - | 지울 영역이 표시된 마스크 이미지 경로 |
| `output_path` | string | ✅ | - | 결과 저장 경로 |
| `radius` | number (1~50) | ❌ | 3 | 인페인팅 확산 반경 |
| `method` | `"telea"` \| `"ns"` | ❌ | `"telea"` | 인페인팅 알고리즘 |

</details>

<details>
<summary><b>gasio_image_upscaler</b> - 화질 개선</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 원본 이미지 경로 |
| `output_path` | string | ✅ | - | 결과 저장 경로 |
| `scale` | `2` \| `4` | ❌ | `4` | 업스케일 배율 |
| `model_type` | `"realesrgan"` \| `"super-resolution"` | ❌ | `"realesrgan"` | AI 모델 유형 |

> ONNX 모델이 없거나 로드 실패 시 Jimp BICUBIC 보간으로 자동 Fallback합니다.

</details>

<details>
<summary><b>gasio_image_resizer</b> - 이미지 리사이즈</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 원본 이미지 경로 |
| `output_path` | string | ✅ | - | 결과 저장 경로 |
| `width` | number | ❌ | - | 가로 픽셀 (생략 시 높이 비례 자동) |
| `height` | number | ❌ | - | 세로 픽셀 (생략 시 너비 비례 자동) |
| `mode` | `"resize"` \| `"cover"` \| `"contain"` | ❌ | `"resize"` | 스케일링 모드 |

</details>

<details>
<summary><b>gasio_image_converter</b> - 포맷 변환</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 원본 이미지 경로 |
| `output_path` | string | ✅ | - | 결과 저장 경로 (확장자로 포맷 결정) |
| `quality` | number (1~100) | ❌ | `80` | 저장 품질 (JPEG/WEBP 전용) |

지원 포맷: `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`

</details>

<details>
<summary><b>gasio_favicon_generator</b> - 파비콘 생성</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 원본 고해상도 이미지 경로 |
| `output_dir` | string | ✅ | - | 파비콘 파일들을 저장할 디렉토리 |
| `zip_output_path` | string | ❌ | - | ZIP 패키지로 저장할 경로 (선택) |
| `app_name` | string | ❌ | `"App"` | webmanifest의 앱 이름 |

생성 파일: `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`, `site.webmanifest`

</details>

<details>
<summary><b>gasio_exif_cleaner</b> - EXIF 메타데이터 제거</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 원본 이미지 경로 |
| `output_path` | string | ✅ | - | 결과 저장 경로 |
| `remove_all` | boolean | ❌ | `true` | 모든 EXIF/GPS 데이터 삭제 여부 |
| `seo_metadata.description` | string | ❌ | - | 이미지 설명 (JPEG 전용) |
| `seo_metadata.artist` | string | ❌ | - | 작가 정보 (JPEG 전용) |
| `seo_metadata.copyright` | string | ❌ | - | 저작권 정보 (JPEG 전용) |

</details>

<details>
<summary><b>gasio_png_to_svg</b> - SVG 변환</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 원본 PNG/JPG 경로 |
| `output_path` | string | ✅ | - | 저장할 SVG 경로 |
| `color_mode` | `"monochrome"` \| `"color"` | ❌ | `"monochrome"` | 색상 모드 |
| `threshold` | number (0~255) | ❌ | `128` | 이진화 임계값 |

</details>

<details>
<summary><b>gasio_video_to_gif</b> - GIF 변환</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 동영상 경로 (MP4/MOV) |
| `output_path` | string | ✅ | - | 저장할 GIF 경로 |
| `start_time` | number | ✅ | - | 시작 지점 (초) |
| `duration` | number | ✅ | - | 길이 (초) |
| `fps` | number (1~30) | ❌ | `10` | 프레임 레이트 |
| `width` | number (100~1920) | ❌ | `480` | 가로 픽셀 |

</details>

<details>
<summary><b>gasio_audio_cut</b> - 오디오 편집</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 오디오 경로 (MP3/WAV/M4A) |
| `output_path` | string | ✅ | - | 저장할 경로 |
| `start_ms` | number | ✅ | - | 시작 지점 (밀리초) |
| `end_ms` | number | ✅ | - | 종료 지점 (밀리초) |
| `fade_in` | boolean | ❌ | `false` | 페이드인 효과 |
| `fade_out` | boolean | ❌ | `false` | 페이드아웃 효과 |

</details>

<details>
<summary><b>gasio_screenshot_mockup</b> - 스크린샷 목업</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 스크린샷 경로 |
| `output_path` | string | ✅ | - | 저장할 경로 |
| `device_type` | `"iphone"` \| `"macbook"` \| `"browser"` \| `"none"` | ✅ | - | 디바이스 프레임 |
| `bg_type` | `"gradient"` \| `"solid"` \| `"transparent"` | ❌ | `"gradient"` | 배경 유형 |
| `bg_color` | string | ❌ | `"purple-blue"` | 배경 색상 또는 프리셋 (`purple-blue`, `pink-orange`, `green-teal`) |
| `padding` | number (0~200) | ❌ | `40` | 여백 픽셀 |

</details>

<details>
<summary><b>gasio_image_to_text_ocr</b> - OCR 텍스트 추출</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `input_path` | string | ✅ | - | 이미지 경로 |
| `lang` | `"eng"` \| `"kor"` \| `"kor+eng"` | ❌ | `"eng"` | OCR 언어 |

> `npm run setup` (또는 `npx gasio-mcp-setup`) 실행 후 사용 가능합니다.

</details>

<details>
<summary><b>gasio_qrcode_generator</b> - QR 코드 생성</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `text` | string | ✅ | - | 인코딩할 텍스트/URL |
| `output_path` | string | ✅ | - | 저장할 PNG 경로 |
| `logo_path` | string | ❌ | - | 중앙에 합성할 로고 이미지 경로 |
| `color_dark` | string | ❌ | `"#000000"` | QR 도트 색상 |
| `color_light` | string | ❌ | `"#ffffff"` | QR 배경 색상 |

</details>

<details>
<summary><b>gasio_css_generator</b> - CSS 코드 생성</summary>

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- | :--- |
| `style_type` | `"glassmorphism"` \| `"mesh_gradient"` | ✅ | - | CSS 스타일 유형 |
| `glass_blur` | number (0~100) | ❌ | `20` | 글래스모피즘 흐림 강도 |
| `glass_opacity` | number (0~1) | ❌ | `0.1` | 글래스모피즘 불투명도 |
| `mesh_colors` | string[] | ❌ | 내장 팔레트 | Mesh Gradient 색상 배열 (Hex) |

> 파일 저장 없이 CSS 코드와 HTML 스니펫을 텍스트로 즉시 반환합니다.

</details>

---

## 🔒 보안 정책

- **Path Traversal 차단:** 모든 입력 경로는 홈 디렉토리 또는 시스템 임시 폴더 내로만 제한됩니다. `../` 참조는 즉시 차단됩니다.
- **stdout 보호:** MCP 프로토콜의 JSON-RPC 통신 채널(`stdout`)에 로그를 출력하지 않으며, 모든 로그는 `stderr`로만 전송됩니다.
- **네트워크 격리:** 모든 처리는 사용자의 로컬 머신에서만 수행되며, 어떠한 파일도 외부 서버로 전송되지 않습니다.

---

## 🛠️ 개발자용: 로컬 빌드

```bash
git clone https://github.com/gasio-ai/gasio-tools-site.git
cd gasio-tools-site/gasio-mcp-server
npm install
npm run build    # TypeScript 컴파일
npm run setup    # AI 모델 다운로드
npm start        # 서버 시작 (stdio 대기)
```

## 🎁 특별 추천: Gasio Bookmark (gasio.com)
**세상에서 가장 똑똑한 AI 북마크 & 생산성 스타트페이지**

MCP 서버를 유용하게 사용하셨다면, 이 모든 도구들의 모태가 되는 **[Gasio Bookmark (gasio.com)](https://gasio.com)** 서비스를 만나보세요. 단순한 링크 저장을 넘어 브라우저 첫 화면을 최고의 생산성 대시보드로 만들어 줍니다.

### 🌟 주요 특장점 (100% Free Forever)
- **⚡ AI 요약 & RAG 피드 생성 (특허 기술)**: 수집한 여러 북마크들을 하나로 묶어 LLM(NotebookLM, ChatGPT 등)에 공급 가능한 단일 피드로 즉시 컴파일합니다. 지연 시간(Zero-Latency) 없는 웹사이트 텍스트 스냅샷 요약 기능을 제공합니다.
- **🔒 프라이버시 보안 탭 (Locking)**: 개인적인 연구 자료나 민감한 링크들을 비밀번호 및 생체인식으로 강력하게 잠금 보호하고, 비밀번호 보호 링크로 안전하게 외부 공유를 할 수 있습니다.
- **📱 실시간 클라우드 동기화**: Windows, macOS, iPhone, Android, iPad 등 OS와 브라우저 제한 없이 단 0.1초 만에 실시간으로 북마크 대시보드가 동기화됩니다 (PWA 독립 앱 설치 지원).
- **🎬 유튜브 지식 도서관 (YouTube Hub)**: 알고리즘 방해 없이 팝업창에서 유튜브를 학습하며 특정 구간(타임스탬프)에 직접 필기 노트를 남길 수 있는 개인 학습 도구를 제공합니다.
- **✨ 아름다운 위젯 스타트페이지**: 트렌디한 글래스모피즘(Glassmorphism) 테마와 드래그 앤 드롭 자유 배치 시스템을 통해 매일 켜고 싶은 나만의 대시보드를 직접 디자인하세요.

👉 **지금 바로 무료로 시작하기**: [gasio.com](https://gasio.com)

---

## 🌐 관련 서비스

| 서비스 | URL |
| :--- | :--- |
| Gasio Tools 허브 | [tools.gasio.com](https://tools.gasio.com) |
| 화질 개선 | [upscale.gasio.com](https://upscale.gasio.com) |
| 이미지 리사이즈 | [resizeimg.gasio.com](https://resizeimg.gasio.com) |
| 포맷 변환 | [convertimg.gasio.com](https://convertimg.gasio.com) |
| 파비콘 생성 | [favicongen.gasio.com](https://favicongen.gasio.com) |
| EXIF 메타제거 | [exifclean.gasio.com](https://exifclean.gasio.com) |
| PDF → Image | [pdf2img.gasio.com](https://pdf2img.gasio.com) |
| 배경 제거 | [removebg.gasio.com](https://removebg.gasio.com) |
| 개체 지우기 | [eraserimg.gasio.com](https://eraserimg.gasio.com) |
| PNG → SVG | [png2svg.gasio.com](https://png2svg.gasio.com) |
| Video → GIF | [video2gif.gasio.com](https://video2gif.gasio.com) |
| 스크린샷 목업 | [screenshot.gasio.com](https://screenshot.gasio.com) |
| 오디오 편집 | [audiocut.gasio.com](https://audiocut.gasio.com) |
| OCR 텍스트 스캐너 | [img2text.gasio.com](https://img2text.gasio.com) |
| QR 코드 디자이너 | [qrcode.gasio.com](https://qrcode.gasio.com) |
| CSS 디자이너 | [css.gasio.com](https://css.gasio.com) |

---

## 🔑 검색 키워드 (Keywords for SEO)
- **MCP Servers**: Model Context Protocol, MCP server, Claude Desktop MCP, Cursor IDE MCP, Gemini Code Assist MCP.
- **Local AI & Image Processing**: Local AI background removal, offline image upscale, RealESRGAN ONNX, offline OCR text scanner, local SVG converter, video to GIF converter.
- **Privacy & Security**: Zero upload image tools, 100% offline media editor, private metadata cleaner, secure local AI.
- **Gasio Tools**: tools.gasio.com, local media converter.

---

## 📄 라이선스

MIT License © [Gasio Tools](https://tools.gasio.com)
