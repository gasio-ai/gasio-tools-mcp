/**
 * handlers/img2text.ts
 * 이미지 → 텍스트 OCR 추출 핸들러
 * tesseract.js (WebAssembly 기반 로컬 OCR) 사용
 * TESSDATA_PREFIX 환경변수를 통해 오프라인 traineddata 경로 지정
 */

import path from "path";
import os from "os";
import fs from "fs";
import Tesseract from "tesseract.js";
import { assertFileExists, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

// setup 스크립트가 ~/.gasio/tesseract/ 에 모델을 저장하므로 동일 경로 참조
// TESSDATA_PREFIX 환경변수가 있으면 그것을 우선 사용
const DEFAULT_TESSDATA = path.join(os.homedir(), ".gasio", "tesseract");

type LangCode = "eng" | "kor" | "kor+eng";

interface ImgToTextArgs {
  input_path: string;
  lang?: LangCode;
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleImageToText(args: ImgToTextArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);

    const lang = args.lang ?? "eng";
    // TESSDATA_PREFIX 환경변수 우선, 없으면 번들 내장 경로 사용
    const tessdataPath = process.env.TESSDATA_PREFIX ?? DEFAULT_TESSDATA;

    const requiredFiles: string[] = [];
    if (lang.includes("eng")) requiredFiles.push("eng.traineddata");
    if (lang.includes("kor")) requiredFiles.push("kor.traineddata");

    const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(tessdataPath, file)));

    if (missingFiles.length > 0) {
      const errorMsg = `Tesseract OCR 언어 데이터 파일(${missingFiles.join(", ")})이 지정된 경로(${tessdataPath})에 존재하지 않습니다.\n\n` +
        `해결책:\n` +
        `AI 기능을 원활하게 사용하려면 오프라인 언어 데이터를 먼저 다운로드 받아야 합니다.\n` +
        `터미널에서 다음 명령어를 실행하여 셋업을 완료해주세요:\n` +
        `  npx @gasio/mcp-server setup\n\n` +
        `또는 가이드라인에 따라 패키지를 재설정하세요.`;
      logger.error(`[img2text] ${errorMsg}`);
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

    logger.info(`OCR 시작: ${args.input_path} (lang=${lang})`);

    // tesseract.js Worker를 생성하고 오프라인 언어 데이터 경로를 지정
    const worker = await Tesseract.createWorker(lang, 1, {
      // stdout 오염 방지: tesseract 내부 logger를 stderr로 리다이렉트
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") {
          logger.debug(`OCR 진행: ${Math.round(m.progress * 100)}%`);
        }
      },
      langPath: tessdataPath,
      gzip: false, // 번들 내 traineddata는 비압축 형태로 저장
    });

    const {
      data: { text, confidence },
    } = await worker.recognize(args.input_path);

    await worker.terminate();

    logger.info(`OCR 완료. 신뢰도: ${confidence.toFixed(1)}%`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            text: text.trim(),
            confidence: parseFloat(confidence.toFixed(2)),
            lang,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`OCR 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
