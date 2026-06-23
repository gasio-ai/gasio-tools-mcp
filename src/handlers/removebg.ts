/**
 * handlers/removebg.ts
 * @imgly/background-removal-node를 이용한 로컬 배경 제거 핸들러
 */

import { removeBackground } from "@imgly/background-removal-node";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { validatePath, assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// npm publish 후 어떤 환경에서도 @imgly 패키지의 실제 설치 경로를 동적으로 찾기 위해
// createRequire를 사용합니다. 하드코딩된 상대경로(../../node_modules/...)는 배포 후 구조가
// 달라져 동작하지 않을 수 있습니다.
const _require = createRequire(import.meta.url);

function resolveImglyPublicPath(): string {
  try {
    const mainPath = _require.resolve("@imgly/background-removal-node");
    const distDir = path.dirname(mainPath);
    return `file://${distDir}/`;
  } catch {
    // Fallback: 로컬 개발 환경에서의 상대 경로
    const fallback = path.resolve(__dirname, "../../node_modules/@imgly/background-removal-node/dist");
    return `file://${fallback}/`;
  }
}

interface RemoveBgArgs {
  input_path: string;
  output_path: string;
  model_preset?: "small" | "medium" | "large";
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleRemoveBackground(args: RemoveBgArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);

    const inputPath = validatePath(args.input_path);
    const outputPath = ensureOutputDir(args.output_path);
    const modelPreset = args.model_preset ?? "medium";

    logger.info(`배경 제거 시작: ${inputPath} → ${outputPath} [모델: ${modelPreset}]`);

    // npm 설치 환경에 관계없이 @imgly 패키지의 dist 경로를 동적으로 해석
    const publicPath = resolveImglyPublicPath();
    logger.info(`[removebg] publicPath: ${publicPath}`);

    // 실행
    const blobResult = await removeBackground(inputPath, {
      model: modelPreset,
      publicPath: publicPath,
      debug: false,
    });

    // Blob 데이터를 Buffer로 변환하여 저장
    const arrayBuffer = await blobResult.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(outputPath, buffer);

    logger.info(`배경 제거 완료: ${outputPath}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            saved_path: outputPath,
            model_preset: modelPreset,
          }),
        },
      ],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`배경 제거 오류: ${errorMsg}`);

    let friendlyMsg = `배경 제거 중 오류가 발생했습니다: ${errorMsg}\n\n` +
      `해결책:\n` +
      `이 기능은 인공지능 기반 배경 제거 패키지와 모델을 사용합니다.\n` +
      `문제가 지속되면 다음 명령어를 통해 리소스를 다시 점검해보세요:\n` +
      `  npx @gasio/mcp-server setup\n\n` +
      `인터넷이 연결되어 있지 않은 오프라인 환경인 경우 모델 다운로드가 불가능할 수 있으므로 네트워크 상태를 확인해주세요.`;

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: friendlyMsg,
        },
      ],
    };
  }
}
