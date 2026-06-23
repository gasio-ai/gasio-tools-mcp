/**
 * handlers/png2svg.ts
 * PNG/JPG → SVG 벡터화 핸들러
 * potrace 모듈을 활용하여 이미지 경로로부터 직접 벡터 트레이싱 수행
 */

import fs from "fs";
import potrace from "potrace";
import { validatePath, assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

interface Png2SvgArgs {
  input_path: string;
  output_path: string;
  color_mode?: "monochrome" | "color";
  threshold?: number;
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handlePng2Svg(args: Png2SvgArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);
    const inputPath = validatePath(args.input_path);
    const outputPath = ensureOutputDir(args.output_path);
    const threshold = args.threshold ?? 128;

    logger.info(`PNG→SVG 변환 시작: ${inputPath}`);

    // potrace로 직접 이미지 파일 경로를 넘겨 트레이싱 (최상위 Jimp v1.x 생성자 충돌 우회)
    await new Promise<void>((resolve, reject) => {
      potrace.trace(
        inputPath,
        { threshold, color: args.color_mode === "color" ? "auto" : "#000000" },
        (err: Error | null, svg: string) => {
          if (err) return reject(err);
          fs.writeFileSync(outputPath, svg, "utf-8");
          resolve();
        }
      );
    });

    logger.info(`PNG→SVG 변환 완료: ${outputPath}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            saved_path: outputPath,
            bridge_url: `https://png2svg.gasio.com/?import=true&source=mcp&file=${encodeURIComponent(outputPath)}`,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`PNG→SVG 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
