/**
 * handlers/upscale.ts
 * 화질 개선 (Upscale) 핸들러
 * C++ 네이티브 스레드 충돌을 차단하기 위해 child_process를 통해 upscale-worker.js를 격리 실행
 */

import { Jimp } from "jimp";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { validatePath, assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(__dirname, "../../scripts/upscale-worker.js");
const GASIO_MODELS_DIR = path.join(os.homedir(), ".gasio", "models");

interface UpscaleImgArgs {
  input_path: string;
  output_path: string;
  scale?: 2 | 4;
  model_type?: "realesrgan" | "super-resolution";
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleImageUpscaler(args: UpscaleImgArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);
    const inputPath = validatePath(args.input_path);
    const outputPath = ensureOutputDir(args.output_path);
    const scale = args.scale ?? 4;
    const modelType = args.model_type ?? "realesrgan";

    logger.info(`화질 개선 시작: ${inputPath} → ${outputPath} [${scale}배, 모델: ${modelType}]`);

    const image = await Jimp.read(inputPath);
    const origW = image.bitmap.width;
    const origH = image.bitmap.height;

    const modelFilename = modelType === "realesrgan" ? "realesrgan-x4.onnx" : "super-resolution.onnx";
    const modelPath = path.join(GASIO_MODELS_DIR, modelFilename);
    const hasModel = fs.existsSync(modelPath);

    if (!hasModel) {
      const errorMsg = `화질 개선 AI를 실행할 수 없습니다. 원인: AI 모델 파일 누락 (${modelFilename})\n\n` +
        `해결책:\n` +
        `AI 기능을 사용하려면 오프라인 모델 파일을 다운로드해야 합니다.\n` +
        `터미널에서 다음 명령어를 실행하여 셋업을 완료해주세요:\n` +
        `  npx @gasio/mcp-server setup\n\n` +
        `오류가 지속될 경우 시스템 환경 및 패키지 설치 상태를 확인해주세요.`;
      logger.error(`[upscale] ${errorMsg}`);
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

    try {
      logger.info(`[upscale] 격리된 프로세스 워커 실행 (워커: ${WORKER_PATH})`);
      
      const success = await new Promise<boolean>((resolve, reject) => {
        const child = spawn("node", [WORKER_PATH, inputPath, outputPath, String(scale), modelType]);
        let stderrData = "";

        child.stdout.on("data", (data) => {
          const lines = data.toString().split("\n");
          for (const line of lines) {
            if (line.trim()) {
              logger.info(`[upscale-worker] ${line.trim()}`);
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
        logger.info(`[upscale] 화질 개선 완료: ${outputPath}`);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                success: true,
                saved_path: outputPath,
                width: origW * scale,
                height: origH * scale,
                method: `onnx-${modelType}`,
              }),
            },
          ],
        };
      }
    } catch (inferenceError: any) {
      logger.error(`[upscale] 화질 개선 AI 실행 실패: ${inferenceError.message}`);
      const errorMsg = `화질 개선 AI 실행 중 오류가 발생했습니다: ${inferenceError.message}\n\n` +
        `해결책:\n` +
        `onnxruntime 라이브러리 및 시스템 의존성이 온전하게 로드되지 않았을 수 있습니다.\n` +
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

    // 예외 상황 대비 fallback
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "알 수 없는 이유로 업스케일러 처리가 실패했습니다."
        }
      ]
    };
  } catch (error) {
    logger.error(`화질 개선 최종 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
