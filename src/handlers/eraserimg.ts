/**
 * handlers/eraserimg.ts
 * 개체 지우기 (Inpainting) 핸들러
 * opencv-wasm 로딩 및 C++ 스레드 충돌을 피하기 위해 child_process를 통해 eraser-worker.js를 격리 실행
 */

import { Jimp } from "jimp";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { validatePath, assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(__dirname, "../../scripts/eraser-worker.js");

interface EraserImgArgs {
  input_path: string;
  mask_path: string;
  output_path: string;
  radius?: number;
  method?: "telea" | "ns";
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleObjectEraser(args: EraserImgArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);
    assertFileExists(args.mask_path);

    const inputPath = validatePath(args.input_path);
    const maskPath = validatePath(args.mask_path);
    const outputPath = ensureOutputDir(args.output_path);

    const radius = args.radius ?? 3;
    const method = args.method ?? "telea";

    logger.info(`개체 지우기 시작: ${inputPath} (마스크: ${maskPath}) → ${outputPath}`);

    // 원본 해상도 체크 목적의 Jimp 읽기
    const origImage = await Jimp.read(inputPath);
    const w = origImage.bitmap.width;
    const h = origImage.bitmap.height;

    try {
      logger.info(`[eraserimg] 격리된 프로세스 워커 실행 (워커: ${WORKER_PATH})`);
      
      const success = await new Promise<boolean>((resolve, reject) => {
        const child = spawn("node", [
          WORKER_PATH,
          inputPath,
          maskPath,
          outputPath,
          String(radius),
          method
        ]);
        let stderrData = "";

        child.stdout.on("data", (data) => {
          const lines = data.toString().split("\n");
          for (const line of lines) {
            if (line.trim()) {
              logger.info(`[eraser-worker] ${line.trim()}`);
            }
          }
        });

        child.stderr.on("data", (data) => {
          stderrData += data.toString();
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve(true);
          } else {
            reject(new Error(stderrData.trim() || `워커가 에러 코드 ${code}로 종료되었습니다.`));
          }
        });
      });

      if (success) {
        logger.info(`[eraserimg] 개체 지우기 완료: ${outputPath}`);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                saved_path: outputPath,
                width: w,
                height: h,
              }),
            },
          ],
        };
      }
    } catch (inferenceError: any) {
      logger.error(`[eraserimg] 개체 지우기 AI 실행 실패: ${inferenceError.message}`);
      const errorMsg = `개체 지우기 실행 중 오류가 발생했습니다: ${inferenceError.message}\n\n` +
        `해결책:\n` +
        `인공지능 모듈 의존성이 온전하게 로드되지 않았을 수 있습니다.\n` +
        `다음 명령어로 필요한 리소스를 다시 점검해보세요:\n` +
        `  npx @gasio/mcp-server setup`;
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: errorMsg
          }
        ]
      };
    }

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "알 수 없는 이유로 개체 지우기 처리가 실패했습니다."
        }
      ]
    };
  } catch (error) {
    logger.error(`개체 지우기 최종 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
