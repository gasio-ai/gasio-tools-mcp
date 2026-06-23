/**
 * handlers/convertimg.ts
 * jimp를 이용한 이미지 포맷 변환 핸들러
 */

import { Jimp } from "jimp";
import fs from "fs";
import path from "path";
import { validatePath, assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

interface ConvertImgArgs {
  input_path: string;
  output_path: string;
  quality?: number;
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleImageConverter(args: ConvertImgArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);
    const inputPath = validatePath(args.input_path);
    const outputPath = ensureOutputDir(args.output_path);
    const quality = args.quality ?? 80;

    logger.info(`이미지 포맷 변환 시작: ${inputPath} → ${outputPath} (품질: ${quality})`);

    const image = await Jimp.read(inputPath);

    // 확장자에 따라 적절한 MIME 타입 매핑
    const ext = path.extname(outputPath).toLowerCase();
    let mime: any = "image/png"; // 기본값
    if (ext === ".jpg" || ext === ".jpeg") {
      mime = "image/jpeg";
    } else if (ext === ".webp") {
      throw new Error(`WebP(.webp) 포맷 변환은 현재 오프라인 Jimp 엔진에서 직접 지원하지 않습니다. 대신 PNG(.png) 또는 JPEG(.jpg) 포맷으로 변환을 시도하십시오.`);
    } else if (ext === ".gif") {
      mime = "image/gif";
    } else if (ext === ".bmp") {
      mime = "image/bmp";
    }

    // 버퍼 렌더링 시 quality 적용 (Jimp v1.x)
    const options: any = {};
    if (quality >= 1 && quality <= 100) {
      options.quality = quality;
    }

    const buffer = await image.getBuffer(mime, options);
    fs.writeFileSync(outputPath, buffer);

    logger.info(`이미지 포맷 변환 완료: ${outputPath}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            saved_path: outputPath,
            width: image.bitmap.width,
            height: image.bitmap.height,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`이미지 포맷 변환 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
