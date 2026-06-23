/**
 * handlers/screenshot.ts
 * 스크린샷 → 디바이스 목업 합성 핸들러
 * jimp (pure-js) 사용. 네이티브 C++ 컴파일 의존성 없음.
 */

import path from "path";
import { fileURLToPath } from "url";
import { Jimp, rgbaToInt } from "jimp";
import { assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = path.resolve(__dirname, "../../resources/frames");

type DeviceType = "iphone" | "macbook" | "browser" | "none";
type BgType = "gradient" | "solid" | "transparent";

interface ScreenshotMockupArgs {
  input_path: string;
  output_path: string;
  device_type: DeviceType;
  bg_type?: BgType;
  bg_color?: string;
  padding?: number;
  shadow?: number;
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

/**
 * Hex 색상 코드를 jimp RGBA 정수로 변환합니다.
 */
function hexToRgba(hex: string, alpha: number = 255): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return rgbaToInt(r, g, b, alpha);
}

/**
 * 그라디언트 배경을 jimp 이미지로 생성합니다.
 */
async function createGradientBackground(
  width: number,
  height: number,
  bgColor: string
): Promise<InstanceType<typeof Jimp>> {
  const bg = new Jimp({ width, height, color: 0xffffffff });

  // 간단한 수직 그라디언트 (시작색 → 종료색)
  const presets: Record<string, [string, string]> = {
    "purple-blue": ["#7c3aed", "#2563eb"],
    "pink-orange": ["#ec4899", "#f97316"],
    "green-teal": ["#16a34a", "#0d9488"],
    default: ["#1e1b4b", "#312e81"],
  };

  const [startHex, endHex] = presets[bgColor] ?? presets["default"];

  const startR = parseInt(startHex.slice(1, 3), 16);
  const startG = parseInt(startHex.slice(3, 5), 16);
  const startB = parseInt(startHex.slice(5, 7), 16);
  const endR = parseInt(endHex.slice(1, 3), 16);
  const endG = parseInt(endHex.slice(3, 5), 16);
  const endB = parseInt(endHex.slice(5, 7), 16);

  for (let y = 0; y < height; y++) {
    const t = y / height;
    const r = Math.round(startR + (endR - startR) * t);
    const g = Math.round(startG + (endG - startG) * t);
    const b = Math.round(startB + (endB - startB) * t);
    for (let x = 0; x < width; x++) {
      bg.setPixelColor(rgbaToInt(r, g, b, 255), x, y);
    }
  }

  return bg;
}

export async function handleScreenshotMockup(args: ScreenshotMockupArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);
    const outputPath = ensureOutputDir(args.output_path);

    const padding = args.padding ?? 40;
    const bgType = args.bg_type ?? "gradient";
    const bgColor = args.bg_color ?? "purple-blue";

    logger.info(`목업 합성 시작: ${args.input_path} (device=${args.device_type})`);

    // 입력 이미지 로드
    const screenshot = await Jimp.read(args.input_path);
    const ssW = screenshot.bitmap.width;
    const ssH = screenshot.bitmap.height;

    // 캔버스 크기 계산
    const canvasW = ssW + padding * 2;
    const canvasH = ssH + padding * 2;

    // 배경 생성
    let canvas: InstanceType<typeof Jimp>;
    if (bgType === "gradient") {
      canvas = await createGradientBackground(canvasW, canvasH, bgColor);
    } else if (bgType === "solid") {
      const solidColor = hexToRgba(bgColor.startsWith("#") ? bgColor : "#1e1b4b");
      canvas = new Jimp({ width: canvasW, height: canvasH, color: solidColor });
    } else {
      // transparent
      canvas = new Jimp({ width: canvasW, height: canvasH, color: 0x00000000 });
    }

    // 디바이스 프레임이 있는 경우 오버레이 합성
    if (args.device_type !== "none") {
      const framePath = path.join(FRAMES_DIR, `${args.device_type}.png`);
      try {
        const frame = await Jimp.read(framePath);
        frame.resize({ w: ssW, h: ssH });
        canvas.composite(screenshot, padding, padding);
        canvas.composite(frame, padding, padding);
      } catch {
        // 프레임 파일이 없으면 스크린샷만 합성
        logger.warn(`디바이스 프레임 파일 없음: ${framePath}. 프레임 없이 합성합니다.`);
        canvas.composite(screenshot, padding, padding);
      }
    } else {
      canvas.composite(screenshot, padding, padding);
    }

    await canvas.write(outputPath as `${string}.${string}`);

    logger.info(`목업 합성 완료: ${outputPath}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            saved_path: outputPath,
            bridge_url: `https://screenshot.gasio.com/?import=true&source=mcp&file=${encodeURIComponent(outputPath)}`,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`목업 합성 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
