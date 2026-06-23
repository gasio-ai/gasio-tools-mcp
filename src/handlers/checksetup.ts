/**
 * handlers/checksetup.ts
 * AI 리소스(Tesseract.js 언어 데이터, ONNX AI 모델)의 오프라인 셋업 상태를 점검하는 핸들러
 */

import fs from "fs";
import path from "path";
import os from "os";
import { createRequire } from "module";

const GASIO_HOME = path.join(os.homedir(), ".gasio");
const TESSDATA_DIR = path.join(GASIO_HOME, "tesseract");
const MODELS_DIR = path.join(GASIO_HOME, "models");

const _require = createRequire(import.meta.url);

interface SetupStatus {
  isSetupComplete: boolean;
  setup_command: string;
  details: {
    tesseract: {
      status: "installed" | "missing";
      dir: string;
      eng: boolean;
      kor: boolean;
    };
    onnx: {
      status: "installed" | "missing" | "partial";
      dir: string;
      super_resolution: boolean;
      realesrgan: boolean;
    };
    imgly: {
      status: "available" | "unavailable";
      resolvedPath: string;
    };
  };
}

export async function handleCheckSetup(): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const engPath = path.join(TESSDATA_DIR, "eng.traineddata");
  const korPath = path.join(TESSDATA_DIR, "kor.traineddata");
  const srPath = path.join(MODELS_DIR, "super-resolution.onnx");
  const realEsrganPath = path.join(MODELS_DIR, "realesrgan-x4.onnx");

  const hasEng = fs.existsSync(engPath);
  const hasKor = fs.existsSync(korPath);
  const hasSr = fs.existsSync(srPath);
  const hasRealEsrgan = fs.existsSync(realEsrganPath);

  // imgly 패키지 확인
  let imglyStatus: "available" | "unavailable" = "available";
  let imglyPath = "";
  try {
    imglyPath = _require.resolve("@imgly/background-removal-node");
  } catch {
    imglyStatus = "unavailable";
  }

  const tesseractInstalled = hasEng && hasKor;
  const onnxInstalled = hasSr && hasRealEsrgan;
  const isSetupComplete = tesseractInstalled && onnxInstalled && (imglyStatus === "available");

  const status: SetupStatus = {
    isSetupComplete,
    setup_command: "npx @gasio/mcp-server setup",
    details: {
      tesseract: {
        status: tesseractInstalled ? "installed" : "missing",
        dir: TESSDATA_DIR,
        eng: hasEng,
        kor: hasKor,
      },
      onnx: {
        status: onnxInstalled ? "installed" : (!hasSr && !hasRealEsrgan ? "missing" : "partial"),
        dir: MODELS_DIR,
        super_resolution: hasSr,
        realesrgan: hasRealEsrgan,
      },
      imgly: {
        status: imglyStatus,
        resolvedPath: imglyPath ? path.dirname(imglyPath) : "",
      },
    },
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(status, null, 2),
      },
    ],
  };
}
