#!/usr/bin/env node
/**
 * scripts/setup.ts
 * Tesseract.js 오프라인 traineddata 및 화질 개선 ONNX AI 모델 자동 다운로드 셋업 스크립트
 * 실행: npm run setup 또는 npx gasio-mcp-setup
 *
 * ⚠️ 저장 위치: ~/.gasio/
 * npm 글로벌 설치 환경에서 node_modules 내부는 쓰기 권한 문제가 있으므로
 * 파일을 사용자 홈 디렉토리에 저장합니다.
 */

import fs from "fs";
import path from "path";
import https from "https";
import os from "os";
import { fileURLToPath } from "url";

// self-signed certificate 에러 우회를 위한 설정 주입
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// 각 리소스를 사용자 홈 디렉토리에 저장 (권한 문제 해결)
const GASIO_HOME = path.join(os.homedir(), ".gasio");
const TESSDATA_DIR = path.join(GASIO_HOME, "tesseract");
const MODELS_DIR = path.join(GASIO_HOME, "models");

const DOWNLOADS = [
  {
    name: "Tesseract 영어 모델",
    dir: TESSDATA_DIR,
    filename: "eng.traineddata",
    url: "https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata",
  },
  {
    name: "Tesseract 한국어 모델",
    dir: TESSDATA_DIR,
    filename: "kor.traineddata",
    url: "https://github.com/tesseract-ocr/tessdata_fast/raw/main/kor.traineddata",
  },
  {
    name: "Super Resolution (2x) AI 모델",
    dir: MODELS_DIR,
    filename: "super-resolution.onnx",
    url: "https://github.com/onnx/models/raw/main/validated/vision/super_resolution/sub_pixel_cnn_2016/model/super-resolution-10.onnx",
  },
  {
    name: "RealESRGAN (4x) AI 모델 (대용량 ~67MB)",
    dir: MODELS_DIR,
    filename: "realesrgan-x4.onnx",
    url: "https://huggingface.co/AXERA-TECH/Real-ESRGAN/resolve/main/onnx/realesrgan-x4.onnx",
  },
];

function download(url: string, dest: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      process.stderr.write(`[setup] 이미 존재하여 건너뜀 [${name}]: ${path.basename(dest)}\n`);
      resolve();
      return;
    }

    process.stderr.write(`[setup] 다운로드 중 [${name}]: ${url}\n`);
    const file = fs.createWriteStream(dest);

    const request = (targetUrl: string) => {
      https.get(targetUrl, (res) => {
        // HTTP 리다이렉트 처리 (301, 302)
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (!location) {
            reject(new Error(`리다이렉트 주소를 찾지 못함: ${targetUrl}`));
            return;
          }
          request(location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP 오류 ${res.statusCode}: ${targetUrl}`));
          return;
        }

        res.pipe(file);
        file.on("finish", () => {
          file.close();
          const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
          process.stderr.write(`[setup] 완료 [${name}]: ${path.basename(dest)} (${sizeMB}MB)\n`);
          resolve();
        });
      }).on("error", (err: Error) => {
        fs.unlink(dest, () => { }); // 실패한 임시 파일 삭제
        reject(err);
      });
    };

    request(url);
  });
}

export async function runSetup() {
  process.stderr.write("[setup] 오프라인 Tesseract 및 ONNX AI 모델 다운로드 시작...\n");

  // 디렉토리들 생성
  if (!fs.existsSync(TESSDATA_DIR)) {
    fs.mkdirSync(TESSDATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }

  // 순차 다운로드 실행
  for (const item of DOWNLOADS) {
    const dest = path.join(item.dir, item.filename);
    try {
      await download(item.url, dest, item.name);
    } catch (err) {
      process.stderr.write(
        `[setup] 오류: [${item.name}] 다운로드 중 에러 발생 - ${err instanceof Error ? err.message : String(err)}\n`
      );
      // 필수적인 모델 에러가 아니면 계속 진행할 수 있게 하거나, 종료
      // Tesseract와 Super Resolution은 필수로 두되, 대용량 RealESRGAN이 혹시 실패하더라도 Fallback이 있으므로 경고로 처리하는 것을 검토
      if (item.filename === "realesrgan-x4.onnx") {
        process.stderr.write("[setup] 경고: RealESRGAN 모델 다운로드 실패. upscale 실행 시 Jimp 보간법으로 Fallback 됩니다.\n");
      } else {
        process.exit(1);
      }
    }
  }

  process.stderr.write("\n[setup] 모든 오프라인 모델 및 AI 리소스 셋업 완료!\n");
  process.stderr.write(`- Tesseract 저장 경로: ${TESSDATA_DIR}\n`);
  process.stderr.write(`- ONNX 모델 저장 경로: ${MODELS_DIR}\n`);
}

// 직접 스크립트 실행 시 호출
const nodePath = fs.realpathSync(process.argv[1]);
const currentPath = fileURLToPath(import.meta.url);
if (nodePath === currentPath) {
  runSetup();
}
