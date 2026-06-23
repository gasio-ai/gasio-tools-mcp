/**
 * handlers/resizeimg.ts
 * 이미지 리사이즈 핸들러
 * jimp (pure-js) 사용 - 네이티브 컴파일 없이 100% 로컬 처리
 */

import { Jimp, ResizeStrategy } from "jimp";
import { validatePath, assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

interface ResizeImgArgs {
  input_path: string;
  output_path: string;
  width?: number;
  height?: number;
  mode?: "resize" | "cover" | "contain";
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleImageResizer(args: ResizeImgArgs): Promise<ToolResult> {
  try {
    if (!args.width && !args.height) {
      throw new Error("width 또는 height 중 하나 이상 지정해야 합니다.");
    }

    assertFileExists(args.input_path);
    const inputPath = validatePath(args.input_path);
    const outputPath = ensureOutputDir(args.output_path);
    const mode = args.mode ?? "resize";

    logger.info(`이미지 리사이즈 시작: ${inputPath} → ${outputPath} [${mode}]`);

    const image = await Jimp.read(inputPath);
    const origW = image.bitmap.width;
    const origH = image.bitmap.height;

    let targetW = args.width ?? 0;
    let targetH = args.height ?? 0;

    // 하나만 지정된 경우 비율 자동 계산
    if (targetW && !targetH) {
      targetH = Math.round((origH / origW) * targetW);
    } else if (targetH && !targetW) {
      targetW = Math.round((origW / origH) * targetH);
    }

    if (mode === "cover") {
      image.cover({ w: targetW, h: targetH });
    } else if (mode === "contain") {
      image.contain({ w: targetW, h: targetH });
    } else {
      image.resize({ w: targetW, h: targetH, mode: ResizeStrategy.BILINEAR });
    }

    await image.write(outputPath as `${string}.${string}`);

    logger.info(`이미지 리사이즈 완료: ${outputPath} [${targetW}x${targetH}]`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            saved_path: outputPath,
            width: targetW,
            height: targetH,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`이미지 리사이즈 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
