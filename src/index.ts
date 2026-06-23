#!/usr/bin/env node
/**
 * index.ts - Gasio MCP Server 메인 진입점
 *
 * MCP 표준 준수:
 * - StdioServerTransport 사용 (HTTP/SSE 아님)
 * - stdout: JSON-RPC 2.0 전용 채널 (console.log 절대 사용 금지)
 * - stderr: 모든 로그 출력 (logger.ts 통해 처리)
 * - zod 스키마로 각 툴의 inputSchema 정의
 * - 에러 시 { isError: true, content: [...] } 형식으로 반환
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { logger } from "./logger.js";
import { handlePng2Svg } from "./handlers/png2svg.js";
import { handleVideo2Gif } from "./handlers/video2gif.js";
import { handleAudioCut } from "./handlers/audiocut.js";
import { handleScreenshotMockup } from "./handlers/screenshot.js";
import { handleImageToText } from "./handlers/img2text.js";
import { handleQRCodeGenerator } from "./handlers/qrcode.js";
import { handleCssGenerator } from "./handlers/cssgen.js";

// 시즌 2 신규 핸들러 가져오기
import { handleRemoveBackground } from "./handlers/removebg.js";
import { handleObjectEraser } from "./handlers/eraserimg.js";
import { handleImageUpscaler } from "./handlers/upscale.js";
import { handleImageResizer } from "./handlers/resizeimg.js";
import { handleImageConverter } from "./handlers/convertimg.js";
import { handleFaviconGenerator } from "./handlers/favicongen.js";
import { handleExifCleaner } from "./handlers/exifclean.js";
import { handleCheckSetup } from "./handlers/checksetup.js";

// 셋업 연동을 위한 가져오기
import { runSetup } from "../scripts/setup.js";
import fs from "fs";
import path from "path";
import os from "os";

// 사용 한도 및 웹 방문 검증 미들웨어 연동
import { verifyUsageAndSession } from "./session.js";

// 3중 안전장치: 필수 리소스 누락 시 실시간 자동 설치 (Self-healing)
async function ensureResourcesReady(toolName: string) {
  const home = os.homedir();
  const engPath = path.join(home, ".gasio", "tesseract", "eng.traineddata");
  const korPath = path.join(home, ".gasio", "tesseract", "kor.traineddata");
  const srPath = path.join(home, ".gasio", "models", "super-resolution.onnx");
  const realEsrganPath = path.join(home, ".gasio", "models", "realesrgan-x4.onnx");

  let needsSetup = false;
  if (toolName === "gasio_image_to_text_ocr") {
    needsSetup = !fs.existsSync(engPath) || !fs.existsSync(korPath);
  } else if (toolName === "gasio_image_upscaler") {
    needsSetup = !fs.existsSync(srPath) || !fs.existsSync(realEsrganPath);
  }

  if (needsSetup) {
    logger.info(`[Auto Setup] '${toolName}' 실행을 위해 필요한 AI 리소스가 누락되어 실시간 자동 다운로드를 시작합니다 (수초 소요)...`);
    try {
      await runSetup();
      logger.info(`[Auto Setup] ✅ AI 리소스 자동 다운로드 완료!`);
    } catch (err) {
      logger.error(`[Auto Setup] ❌ 자동 다운로드 실패: ${err instanceof Error ? err.message : String(err)}`);
      throw new Error(`필수 AI 리소스가 누락되었으며 자동 복구에 실패했습니다. 터미널에서 'mcp-server setup'을 수동으로 수행해 주세요.`);
    }
  }
}

// 공통 세션 제어 및 셋업 가드 래퍼 미들웨어
function withSessionGuard<T extends Record<string, any>>(
  toolName: string,
  handler: (args: T) => Promise<any>
) {
  return async (args: T) => {
    // 3중 안전장치: 필수 리소스 자동 검사 및 복구 실행
    try {
      await ensureResourcesReady(toolName);
    } catch (err: any) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: err.message || "필수 AI 리소스가 누락되어 도구를 기동할 수 없습니다."
          }
        ]
      };
    }

    const sessionCheck = await verifyUsageAndSession(toolName, (msg) => {
      // stderr 로그 출력을 통해 MCP Stdio 채널의 오염 없이 안전하게 정보 전달
      logger.info(msg);
    });

    if (!sessionCheck.pass) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: sessionCheck.message || "로컬 사용 한도가 초과되어 세션 검증이 필요합니다."
          }
        ]
      };
    }

    return handler(args);
  };
}

// ─── MCP Server 초기화 ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "gasio-mcp-server",
  version: "1.0.0",
});

// ─── Tool 1: gasio_png_to_svg ────────────────────────────────────────────────

server.tool(
  "gasio_png_to_svg",
  "PNG 또는 JPG 비트맵 이미지를 SVG 벡터 파일로 변환합니다. 100% 로컬 오프라인 처리. 파일이 외부 서버에 업로드되지 않습니다.",
  {
    input_path: z
      .string()
      .describe("변환할 비트맵 이미지(PNG/JPG)의 로컬 절대 경로"),
    output_path: z
      .string()
      .describe("저장할 SVG 파일의 로컬 절대 경로 (예: /Users/me/output/result.svg)"),
    color_mode: z
      .enum(["monochrome", "color"])
      .optional()
      .describe("변환 색상 모드 (기본값: monochrome)"),
    threshold: z
      .number()
      .min(0)
      .max(255)
      .optional()
      .describe("이미지 이진화 트레이싱 임계값 0~255 (기본값: 128)"),
  },
  withSessionGuard("gasio_png_to_svg", handlePng2Svg)
);

// ─── Tool 2: gasio_video_to_gif ──────────────────────────────────────────────

server.tool(
  "gasio_video_to_gif",
  "MP4 또는 MOV 동영상에서 지정 구간을 잘라 GIF 애니메이션으로 변환합니다. ffmpeg-static 내장 바이너리 사용으로 로컬 설치 무결성 보장.",
  {
    input_path: z
      .string()
      .describe("동영상 파일(MP4/MOV)의 로컬 절대 경로"),
    output_path: z
      .string()
      .describe("저장할 GIF 파일의 로컬 절대 경로"),
    start_time: z
      .number()
      .min(0)
      .describe("잘라낼 시작 지점 (단위: 초)"),
    duration: z
      .number()
      .min(0.1)
      .describe("잘라낼 구간 길이 (단위: 초)"),
    fps: z
      .number()
      .min(1)
      .max(30)
      .optional()
      .describe("GIF 프레임 레이트 (기본값: 10)"),
    width: z
      .number()
      .min(100)
      .max(1920)
      .optional()
      .describe("GIF 가로 해상도 픽셀 (기본값: 480)"),
  },
  withSessionGuard("gasio_video_to_gif", handleVideo2Gif)
);

// ─── Tool 3: gasio_screenshot_mockup ────────────────────────────────────────

server.tool(
  "gasio_screenshot_mockup",
  "스크린샷 이미지를 디바이스 프레임(iPhone/MacBook/Browser) 목업에 합성하여 마케팅용 이미지로 변환합니다. jimp pure-js 사용.",
  {
    input_path: z
      .string()
      .describe("스크린샷 이미지의 로컬 절대 경로"),
    output_path: z
      .string()
      .describe("저장할 합성 목업 이미지의 로컬 절대 경로"),
    device_type: z
      .enum(["iphone", "macbook", "browser", "none"])
      .describe("합성할 디바이스 프레임 종류"),
    bg_type: z
      .enum(["gradient", "solid", "transparent"])
      .optional()
      .describe("배경 유형 (기본값: gradient)"),
    bg_color: z
      .string()
      .optional()
      .describe("배경 색상 Hex 코드(#RRGGBB) 또는 그라디언트 프리셋 키 (purple-blue/pink-orange/green-teal)"),
    padding: z
      .number()
      .min(0)
      .max(200)
      .optional()
      .describe("이미지 외곽 여백 픽셀 (기본값: 40)"),
    shadow: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("그림자 깊이 0~100 (기본값: 50, 현재 버전에서는 예약 파라미터)"),
  },
  withSessionGuard("gasio_screenshot_mockup", handleScreenshotMockup)
);

// ─── Tool 4: gasio_audio_cut ─────────────────────────────────────────────────

server.tool(
  "gasio_audio_cut",
  "MP3/WAV/M4A 오디오 파일에서 특정 구간을 밀리초 단위로 잘라내고, 선택적으로 페이드인/페이드아웃 효과를 적용합니다.",
  {
    input_path: z
      .string()
      .describe("오디오 파일(MP3/WAV/M4A)의 로컬 절대 경로"),
    output_path: z
      .string()
      .describe("저장할 편집된 오디오 파일의 로컬 절대 경로"),
    start_ms: z
      .number()
      .min(0)
      .describe("편집 시작 지점 (단위: 밀리초)"),
    end_ms: z
      .number()
      .min(1)
      .describe("편집 종료 지점 (단위: 밀리초, start_ms보다 커야 함)"),
    fade_in: z
      .boolean()
      .optional()
      .describe("시작 부분에 1초 페이드인 효과 적용 여부 (기본값: false)"),
    fade_out: z
      .boolean()
      .optional()
      .describe("끝 부분에 1초 페이드아웃 효과 적용 여부 (기본값: false)"),
  },
  withSessionGuard("gasio_audio_cut", handleAudioCut)
);

// ─── Tool 5: gasio_image_to_text_ocr ────────────────────────────────────────

server.tool(
  "gasio_image_to_text_ocr",
  "이미지(PNG/JPG)에서 텍스트를 추출합니다. WebAssembly 기반 tesseract.js 엔진으로 100% 로컬 처리. 한국어/영어 지원.",
  {
    input_path: z
      .string()
      .describe("텍스트가 포함된 이미지의 로컬 절대 경로 (PNG/JPG)"),
    lang: z
      .enum(["eng", "kor", "kor+eng"])
      .optional()
      .describe("OCR 인식 언어 코드 (기본값: eng)"),
  },
  withSessionGuard("gasio_image_to_text_ocr", handleImageToText)
);

// ─── Tool 6: gasio_qrcode_generator ─────────────────────────────────────────

server.tool(
  "gasio_qrcode_generator",
  "텍스트 또는 URL을 QR 코드 PNG 이미지로 생성합니다. 선택적으로 중앙에 브랜드 로고를 합성할 수 있습니다.",
  {
    text: z
      .string()
      .min(1)
      .describe("QR 코드에 인코딩할 텍스트 또는 URL"),
    output_path: z
      .string()
      .describe("저장할 QR 코드 PNG 파일의 로컬 절대 경로"),
    logo_path: z
      .string()
      .optional()
      .describe("QR 코드 중앙에 합성할 브랜드 로고 이미지의 로컬 절대 경로 (선택사항)"),
    color_dark: z
      .string()
      .optional()
      .describe("QR 코드 도트 색상 Hex 코드 (기본값: #000000)"),
    color_light: z
      .string()
      .optional()
      .describe("QR 코드 배경 색상 Hex 코드 (기본값: #ffffff)"),
  },
  withSessionGuard("gasio_qrcode_generator", handleQRCodeGenerator)
);

// ─── Tool 7: gasio_css_generator ─────────────────────────────────────────────

server.tool(
  "gasio_css_generator",
  "Glassmorphism 또는 Mesh Gradient CSS 스타일시트 코드와 HTML 스니펫을 생성합니다. 외부 라이브러리 의존성 없이 즉시 반환.",
  {
    style_type: z
      .enum(["glassmorphism", "mesh_gradient"])
      .describe("생성할 CSS 스타일 유형"),
    glass_blur: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Glassmorphism 흐림 강도 0~100 (기본값: 20, glassmorphism 전용)"),
    glass_opacity: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Glassmorphism 배경 불투명도 0.0~1.0 (기본값: 0.1, glassmorphism 전용)"),
    mesh_colors: z
      .array(z.string())
      .optional()
      .describe("Mesh Gradient에 사용할 Hex 색상 배열 최소 4개 권장 (기본값: 내장 팔레트, mesh_gradient 전용)"),
  },
  withSessionGuard("gasio_css_generator", handleCssGenerator)
);

// ─── Tool 8: gasio_remove_background ──────────────────────────────────────────

server.tool(
  "gasio_remove_background",
  "이미지(PNG/JPG)에서 인물 또는 개체의 배경을 로컬에서 인공지능으로 분리하고 투명 배경 PNG 파일로 저장합니다. 100% 로컬 오프라인 실행.",
  {
    input_path: z.string().describe("배경을 제거할 이미지 파일의 로컬 절대 경로"),
    output_path: z.string().describe("배경이 제거된 투명 PNG 이미지를 저장할 로컬 절대 경로"),
    model_preset: z
      .enum(["small", "medium", "large"])
      .optional()
      .describe("배경 제거 인공지능 모델 크기 프리셋 (기본값: medium)"),
  },
  withSessionGuard("gasio_remove_background", handleRemoveBackground)
);

// ─── Tool 9: gasio_object_eraser ─────────────────────────────────────────────

server.tool(
  "gasio_object_eraser",
  "이미지 내에서 지우고자 하는 특정 개체를 마스크 이미지 영역을 기반으로 주변 픽셀을 분석하여 자연스럽게 채워 지웁니다. 100% 로컬 오프라인 실행.",
  {
    input_path: z.string().describe("원본 이미지 파일의 로컬 절대 경로"),
    mask_path: z.string().describe("지우고자 하는 영역이 마킹된 마스크 이미지 파일의 로컬 절대 경로"),
    output_path: z.string().describe("복원이 완료된 최종 결과 이미지를 저장할 로컬 절대 경로"),
    radius: z.number().min(1).max(50).optional().describe("인페인팅 보간 확산 반경 (기본값: 3)"),
    method: z.enum(["telea", "ns"]).optional().describe("인페인팅 알고리즘 (telea: FMM, ns: Navier-Stokes, 기본값: telea)"),
  },
  withSessionGuard("gasio_object_eraser", handleObjectEraser)
);

// ─── Tool 10: gasio_image_upscaler ───────────────────────────────────────────

server.tool(
  "gasio_image_upscaler",
  "저화질 이미지를 초고해상도 AI 모델(RealESRGAN 등)을 사용해 고화질로 개선합니다. 모델이 없는 경우 고급 보간 리사이즈로 자동 대체됩니다.",
  {
    input_path: z.string().describe("해상도를 복원 및 개선할 원본 이미지 파일의 로컬 절대 경로"),
    output_path: z.string().describe("업스케일된 고해상도 이미지 파일을 저장할 로컬 절대 경로"),
    scale: z.union([z.literal(2), z.literal(4)]).optional().describe("업스케일링 배율 (2 또는 4, 기본값: 4)"),
    model_type: z.enum(["realesrgan", "super-resolution"]).optional().describe("사용할 초고해상도 AI 모델 타입 (기본값: realesrgan)"),
  },
  withSessionGuard("gasio_image_upscaler", handleImageUpscaler)
);

// ─── Tool 11: gasio_image_resizer ────────────────────────────────────────────

server.tool(
  "gasio_image_resizer",
  "이미지의 크기(가로/세로)를 지정된 픽셀 크기로 조정합니다. 가로/세로 비율 고정 및 다양한 스케일링 레이아웃(resize, cover, contain)을 지원합니다.",
  {
    input_path: z.string().describe("원본 이미지 파일의 로컬 절대 경로"),
    output_path: z.string().describe("크기가 조정된 결과 이미지 파일을 저장할 로컬 절대 경로"),
    width: z.number().min(1).optional().describe("변경할 가로 해상도 픽셀 (생략 시 높이 비례 자동 조정)"),
    height: z.number().min(1).optional().describe("변경할 세로 해상도 픽셀 (생략 시 너비 비례 자동 조정)"),
    mode: z.enum(["resize", "cover", "contain"]).optional().describe("이미지 채우기 모드 (기본값: resize)"),
  },
  withSessionGuard("gasio_image_resizer", handleImageResizer)
);

// ─── Tool 12: gasio_image_converter ──────────────────────────────────────────

server.tool(
  "gasio_image_converter",
  "이미지를 다른 파일 형식(PNG, JPEG, WEBP 등)으로 변환합니다. 저장 시 화질 품질(quality) 설정이 가능합니다.",
  {
    input_path: z.string().describe("변환할 원본 이미지 파일의 로컬 절대 경로"),
    output_path: z.string().describe("변환된 결과 이미지 파일을 저장할 로컬 절대 경로 (확장자에 따라 변환 포맷 자동 지정)"),
    quality: z.number().min(1).max(100).optional().describe("저장 품질 1~100 (JPEG/WEBP에 적용, 기본값: 80)"),
  },
  withSessionGuard("gasio_image_converter", handleImageConverter)
);

// ─── Tool 13: gasio_favicon_generator ────────────────────────────────────────

server.tool(
  "gasio_favicon_generator",
  "고해상도 이미지(PNG/JPG)를 입력받아 웹 표준 파비콘 세트(favicon.ico, apple-icon.png, manifest 등)를 생성합니다. 선택 시 ZIP 패키징을 제공합니다.",
  {
    input_path: z.string().describe("파비콘용 원본 고해상도 이미지의 로컬 절대 경로"),
    output_dir: z.string().describe("생성된 개별 파비콘 리소스들을 저장할 디렉토리의 로컬 절대 경로"),
    zip_output_path: z.string().optional().describe("파비콘 세트를 하나로 묶은 ZIP 압축 파일을 저장할 로컬 절대 경로 (선택사항)"),
    app_name: z.string().optional().describe("webmanifest 메타데이터에 기입될 웹앱 이름 (기본값: App)"),
  },
  withSessionGuard("gasio_favicon_generator", handleFaviconGenerator)
);

// ─── Tool 14: gasio_exif_cleaner ─────────────────────────────────────────────

server.tool(
  "gasio_exif_cleaner",
  "이미지 파일에서 개인정보나 기기 정보가 포함된 EXIF 및 GPS 메타데이터를 제거합니다. 필요 시 작가, 저작권, 설명과 같은 SEO용 메타데이터를 주입할 수 있습니다.",
  {
    input_path: z.string().describe("메타데이터를 정제할 이미지 파일의 로컬 절대 경로"),
    output_path: z.string().describe("정제된 이미지를 저장할 로컬 절대 경로"),
    remove_all: z.boolean().optional().describe("모든 EXIF 및 GPS 데이터를 지울지 여부 (기본값: true)"),
    seo_metadata: z
      .object({
        description: z.string().optional().describe("EXIF에 주입할 이미지 설명"),
        artist: z.string().optional().describe("EXIF에 주입할 작가/촬영자 이름"),
        copyright: z.string().optional().describe("EXIF에 주입할 저작권 표기"),
      })
      .optional()
      .describe("추가로 주입할 검색엔진 최적화(SEO)용 이미지 태그 정보 (선택사항, JPEG 전용)"),
  },
  withSessionGuard("gasio_exif_cleaner", handleExifCleaner)
);

// ─── Tool 15: gasio_check_setup ──────────────────────────────────────────────

server.tool(
  "gasio_check_setup",
  "Tesseract OCR 언어 데이터 및 ONNX 화질 개선 AI 모델 등의 로컬 다운로드 및 준비 상태를 진단합니다. AI 기능 실행 전에 상태를 점검할 수 있습니다.",
  {},
  async () => handleCheckSetup()
);

// ─── 서버 시작 ──────────────────────────────────────────────────────────────

async function main() {
  // 명령행 인수에 setup이 있으면 셋업 프로세스 실행 후 종료
  if (process.argv.includes("setup")) {
    try {
      await runSetup();
      process.exit(0);
    } catch (error) {
      process.stderr.write(`[setup] 치명적 오류 발생: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    }
  }

  logger.info("Gasio MCP Server v1.0.0 시작 중...");
  logger.info("전송 계층: StdioServerTransport (stdio JSON-RPC 2.0)");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Gasio MCP Server가 준비되었습니다. 에이전트 연결을 대기 중입니다.");
}

main().catch((error: unknown) => {
  logger.error("서버 시작 오류:", error);
  process.exit(1);
});
