/**
 * scripts/upscale-worker.ts
 * 화질 개선 AI 모델 인퍼런스를 타 핸들러(OpenCV, imgly 등)와의 네이티브 충돌로부터
 * 격리시키기 위해 독립 프로세스로 실행되는 워커 스크립트.
 */

import ort from "onnxruntime-node";
import { Jimp, ResizeStrategy } from "jimp";
import path from "path";
import fs from "fs";
import os from "os";

const GASIO_MODELS_DIR = path.join(os.homedir(), ".gasio", "models");

interface WorkerArgs {
  inputPath: string;
  outputPath: string;
  scale: number;
  modelType: "realesrgan" | "super-resolution";
}

async function runInference({ inputPath, outputPath, scale, modelType }: WorkerArgs) {
  const image = await Jimp.read(inputPath);
  const origW = image.bitmap.width;
  const origH = image.bitmap.height;

  const modelFilename = modelType === "realesrgan" ? "realesrgan-x4.onnx" : "super-resolution.onnx";
  const modelPath = path.join(GASIO_MODELS_DIR, modelFilename);

  if (!fs.existsSync(modelPath)) {
    throw new Error(`AI 모델 파일이 누락되었습니다: ${modelFilename}`);
  }

  // MCP stdio 스트림 오염 방지를 위해 logSeverityLevel: 3 적용
  const session = await ort.InferenceSession.create(modelPath, { logSeverityLevel: 3 });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  if (modelType === "super-resolution") {
    // ─── Super Resolution (SubPixel CNN) ───
    const modelW = 224;
    const modelH = 224;
    
    const resizedInput = image.clone().resize({ w: modelW, h: modelH });
    const tensorData = new Float32Array(modelW * modelH);
    
    for (let i = 0; i < modelW * modelH; i++) {
      const idx = i * 4;
      const r = resizedInput.bitmap.data[idx];
      const g = resizedInput.bitmap.data[idx + 1];
      const b = resizedInput.bitmap.data[idx + 2];
      
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      tensorData[i] = y / 255.0;
    }

    const inputTensor = new ort.Tensor("float32", tensorData, [1, 1, modelH, modelW]);
    const feeds: Record<string, any> = {};
    feeds[inputName] = inputTensor;

    const results = await session.run(feeds);
    const outputTensor = results[outputName];
    const outH = outputTensor.dims[2]; // 672
    const outW = outputTensor.dims[3]; // 672
    const outputData = outputTensor.data as Float32Array;

    const colorImage = image.clone().resize({ w: outW, h: outH, mode: ResizeStrategy.BICUBIC });
    const finalBuffer = Buffer.alloc(outW * outH * 4);
    for (let i = 0; i < outW * outH; i++) {
      const idx = i * 4;
      const r2 = colorImage.bitmap.data[idx];
      const g2 = colorImage.bitmap.data[idx + 1];
      const b2 = colorImage.bitmap.data[idx + 2];

      const cb = -0.1687 * r2 - 0.3313 * g2 + 0.5 * b2 + 128;
      const cr = 0.5 * r2 - 0.4187 * g2 - 0.0813 * b2 + 128;

      const y = outputData[i] * 255.0;

      let r = y + 1.402 * (cr - 128);
      let g = y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128);
      let b = y + 1.772 * (cb - 128);

      finalBuffer[idx] = Math.max(0, Math.min(255, r));
      finalBuffer[idx + 1] = Math.max(0, Math.min(255, g));
      finalBuffer[idx + 2] = Math.max(0, Math.min(255, b));
      finalBuffer[idx + 3] = 255;
    }

    colorImage.bitmap.data.set(finalBuffer);
    const targetW = origW * scale;
    const targetH = origH * scale;
    const finalOutputImg = colorImage.resize({ w: targetW, h: targetH, mode: ResizeStrategy.BICUBIC });

    await finalOutputImg.write(outputPath as `${string}.${string}`);
  } else {
    // ─── RealESRGAN ───
    const modelW = 64;
    const modelH = 64;
    
    const resizedInput = image.clone().resize({ w: modelW, h: modelH });
    const tensorData = new Float32Array(3 * modelW * modelH);
    const channelSize = modelW * modelH;

    for (let i = 0; i < channelSize; i++) {
      const idx = i * 4;
      const r = resizedInput.bitmap.data[idx];
      const g = resizedInput.bitmap.data[idx + 1];
      const b = resizedInput.bitmap.data[idx + 2];

      tensorData[i] = r / 255.0;
      tensorData[channelSize + i] = g / 255.0;
      tensorData[2 * channelSize + i] = b / 255.0;
    }

    const inputTensor = new ort.Tensor("float32", tensorData, [1, 3, modelH, modelW]);
    const feeds: Record<string, any> = {};
    feeds[inputName] = inputTensor;

    const results = await session.run(feeds);
    const outputTensor = results[outputName];
    const outH = outputTensor.dims[2]; // 256
    const outW = outputTensor.dims[3]; // 256
    const outputData = outputTensor.data as Float32Array;

    const finalBuffer = Buffer.alloc(outW * outH * 4);
    const outChannelSize = outW * outH;

    for (let i = 0; i < outChannelSize; i++) {
      const idx = i * 4;
      let r = outputData[i] * 255.0;
      let g = outputData[outChannelSize + i] * 255.0;
      let b = outputData[2 * outChannelSize + i] * 255.0;

      finalBuffer[idx] = Math.max(0, Math.min(255, r));
      finalBuffer[idx + 1] = Math.max(0, Math.min(255, g));
      finalBuffer[idx + 2] = Math.max(0, Math.min(255, b));
      finalBuffer[idx + 3] = 255;
    }

    const inferenceResultImg = image.clone().resize({ w: outW, h: outH });
    inferenceResultImg.bitmap.data.set(finalBuffer);

    const targetW = origW * scale;
    const targetH = origH * scale;
    const finalOutputImg = inferenceResultImg.resize({ w: targetW, h: targetH, mode: ResizeStrategy.BICUBIC });

    await finalOutputImg.write(outputPath as `${string}.${string}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) {
    process.stderr.write("오류: 잘못된 인수 개수\n");
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];
  const scale = parseInt(args[2], 10);
  const modelType = args[3] as "realesrgan" | "super-resolution";

  try {
    await runInference({ inputPath, outputPath, scale, modelType });
    process.exit(0);
  } catch (err) {
    process.stderr.write(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
