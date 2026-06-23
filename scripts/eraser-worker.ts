/**
 * scripts/eraser-worker.ts
 * OpenCV Wasm 인페인팅 연산을 타 네이티브 라이브러리와 격리된 환경에서 안전하게 수행하기 위한 워커 프로세스.
 */

import { Jimp } from "jimp";
import path from "path";
import fs from "fs";

async function getCv(): Promise<any> {
  console.log("[Worker-Debug] Importing opencv-wasm...");
  try {
    const cvModule = await import("opencv-wasm");
    console.log("[Worker-Debug] opencv-wasm module imported!");
    const raw = (cvModule as any).default ?? cvModule;
    console.log("[Worker-Debug] Resolving thenable/cv...");
    const cv = typeof raw.then === "function" ? await raw : (raw.cv ?? raw);
    console.log("[Worker-Debug] OpenCV compiled & loaded successfully!");
    if (cv) {
      try {
        delete cv.then;
      } catch (e) {
        // 혹시 delete가 readonly 속성 등의 이유로 막힐 때를 대비
        try { cv.then = undefined; } catch {}
      }
    }
    return cv;
  } catch (e) {
    throw new Error(`opencv-wasm 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

interface WorkerArgs {
  inputPath: string;
  maskPath: string;
  outputPath: string;
  radius: number;
  method: "telea" | "ns";
}

async function runInference({ inputPath, maskPath, outputPath, radius, method }: WorkerArgs) {
  console.log("[Worker-Debug] Reading inputImage...");
  const origImage = await Jimp.read(inputPath);
  console.log("[Worker-Debug] Reading maskImage...");
  const maskImage = await Jimp.read(maskPath);

  if (maskImage.bitmap.width !== origImage.bitmap.width || maskImage.bitmap.height !== origImage.bitmap.height) {
    console.log("[Worker-Debug] Resizing mask to match input resolution...");
    maskImage.resize({ w: origImage.bitmap.width, h: origImage.bitmap.height });
  }

  const w = origImage.bitmap.width;
  const h = origImage.bitmap.height;

  console.log("[Worker-Debug] Initializing OpenCV...");
  const cv = await getCv();

  console.log("[Worker-Debug] Creating src mat...");
  const src = cv.matFromImageData({
    width: w,
    height: h,
    data: new Uint8ClampedArray(origImage.bitmap.data),
  });

  console.log("[Worker-Debug] Creating mask mat...");
  const rawMask = cv.matFromImageData({
    width: w,
    height: h,
    data: new Uint8ClampedArray(maskImage.bitmap.data),
  });

  const srcRGB = new cv.Mat();
  const dstRGB = new cv.Mat();
  const dst = new cv.Mat();
  const maskGray = new cv.Mat();

  console.log("[Worker-Debug] Converting src RGBA to RGB...");
  cv.cvtColor(src, srcRGB, cv.COLOR_RGBA2RGB, 0);
  
  console.log("[Worker-Debug] Converting mask RGBA to GRAY...");
  cv.cvtColor(rawMask, maskGray, cv.COLOR_RGBA2GRAY, 0);
  cv.threshold(maskGray, maskGray, 1, 255, cv.THRESH_BINARY);

  console.log("[Worker-Debug] Running cv.inpaint...");
  const cvMethod = method === "ns" ? cv.INPAINT_NS : cv.INPAINT_TELEA;
  cv.inpaint(srcRGB, maskGray, dstRGB, radius, cvMethod);

  console.log("[Worker-Debug] Converting dst RGB back to RGBA...");
  cv.cvtColor(dstRGB, dst, cv.COLOR_RGB2RGBA, 0);

  console.log("[Worker-Debug] Writing buffer back to Jimp...");
  const resultImage = origImage.clone();
  resultImage.bitmap.data.set(dst.data);

  console.log("[Worker-Debug] Saving image...");
  await resultImage.write(outputPath as `${string}.${string}`);
  console.log("[Worker-Debug] Image saved successfully!");

  src.delete();
  rawMask.delete();
  srcRGB.delete();
  dstRGB.delete();
  dst.delete();
  maskGray.delete();
}

async function main() {
  console.log("[Worker-Debug] main() started!");
  const args = process.argv.slice(2);
  console.log("[Worker-Debug] arguments count:", args.length);
  if (args.length < 5) {
    process.stderr.write("오류: 잘못된 인수 개수\n");
    process.exit(1);
  }

  const inputPath = args[0];
  const maskPath = args[1];
  const outputPath = args[2];
  const radius = parseInt(args[3], 10);
  const method = args[4] as "telea" | "ns";

  try {
    await runInference({ inputPath, maskPath, outputPath, radius, method });
    console.log("[Worker-Debug] runInference completed successfully!");
    process.exit(0);
  } catch (err: any) {
    process.stderr.write(`[Worker-Debug] Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

main();
