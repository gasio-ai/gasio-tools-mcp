/**
 * handlers/favicongen.ts
 * jimp + jszip을 이용한 파비콘 리소스 세트 생성 핸들러 (100% 로컬)
 */

import { Jimp } from "jimp";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { validatePath, assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

interface FaviconGenArgs {
  input_path: string;
  output_dir: string;
  zip_output_path?: string;
  app_name?: string;
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

/**
 * 여러 PNG 바이너리를 읽어 하나의 ICO(Icon) 파일 포맷 바이너리로 조립합니다.
 */
function createIcoFromPngs(pngBuffers: Array<{ width: number; height: number; buffer: Buffer }>): Buffer {
  const count = pngBuffers.length;
  // ICO 헤더 크기: 6 bytes
  // 각 이미지 엔트리 크기: 16 bytes
  const headerSize = 6 + 16 * count;

  let totalSize = headerSize;
  for (const item of pngBuffers) {
    totalSize += item.buffer.length;
  }

  const icoBuffer = Buffer.alloc(totalSize);

  // 1. ICONDIR Header (6 bytes)
  icoBuffer.writeUInt16LE(0, 0); // Reserved
  icoBuffer.writeUInt16LE(1, 2); // Type: 1 = Icon
  icoBuffer.writeUInt16LE(count, 4); // Image Count

  // 2. ICONDIRENTRY & Image Data 쓰기
  let currentOffset = headerSize;
  for (let i = 0; i < count; i++) {
    const item = pngBuffers[i];
    const entryOffset = 6 + 16 * i;

    const w = item.width >= 256 ? 0 : item.width;
    const h = item.height >= 256 ? 0 : item.height;

    icoBuffer.writeUInt8(w, entryOffset + 0); // Width
    icoBuffer.writeUInt8(h, entryOffset + 1); // Height
    icoBuffer.writeUInt8(0, entryOffset + 2); // Color count
    icoBuffer.writeUInt8(0, entryOffset + 3); // Reserved
    icoBuffer.writeUInt16LE(1, entryOffset + 4); // Color planes
    icoBuffer.writeUInt16LE(32, entryOffset + 6); // Bits per pixel (usually 32)
    icoBuffer.writeUInt32LE(item.buffer.length, entryOffset + 8); // Size of image data
    icoBuffer.writeUInt32LE(currentOffset, entryOffset + 12); // Offset to image data

    // 이미지 데이터 복사
    item.buffer.copy(icoBuffer, currentOffset);
    currentOffset += item.buffer.length;
  }

  return icoBuffer;
}

export async function handleFaviconGenerator(args: FaviconGenArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);
    const inputPath = validatePath(args.input_path);
    const outputDir = validatePath(args.output_dir);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const appName = args.app_name ?? "App";
    logger.info(`파비콘 세트 생성 시작: ${inputPath} → ${outputDir}`);

    const baseImage = await Jimp.read(inputPath);

    // 생성할 파비콘 규격 정의
    const targets = [
      { name: "favicon-16x16.png", size: 16 },
      { name: "favicon-32x32.png", size: 32 },
      { name: "favicon-48x48.png", size: 48 },
      { name: "apple-touch-icon.png", size: 180 },
      { name: "android-chrome-192x192.png", size: 192 },
      { name: "android-chrome-512x512.png", size: 512 },
    ];

    const savedFiles: string[] = [];
    const icoPngs: Array<{ width: number; height: number; buffer: Buffer }> = [];

    // 1. 각 사이즈별 리사이즈 및 저장
    for (const target of targets) {
      const resized = baseImage.clone();
      resized.resize({ w: target.size, h: target.size });
      const outputPath = path.join(outputDir, target.name);
      
      // 버퍼 얻기 (Jimp v1.x)
      const pngBuffer = await resized.getBuffer("image/png");
      fs.writeFileSync(outputPath, pngBuffer);
      savedFiles.push(outputPath);

      // ICO에 포함시킬 사이즈 (16, 32, 48) 추출
      if (target.size === 16 || target.size === 32 || target.size === 48) {
        icoPngs.push({
          width: target.size,
          height: target.size,
          buffer: pngBuffer,
        });
      }
    }

    // 2. favicon.ico 생성 및 저장
    const icoBuffer = createIcoFromPngs(icoPngs);
    const icoPath = path.join(outputDir, "favicon.ico");
    fs.writeFileSync(icoPath, icoBuffer);
    savedFiles.push(icoPath);

    // 3. site.webmanifest 생성 및 저장
    const manifest = {
      name: appName,
      short_name: appName,
      icons: [
        {
          src: "/android-chrome-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/android-chrome-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
      theme_color: "#ffffff",
      background_color: "#ffffff",
      display: "standalone",
    };
    const manifestPath = path.join(outputDir, "site.webmanifest");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    savedFiles.push(manifestPath);

    // 4. ZIP 패키징 (선택사항)
    let savedZipPath: string | undefined = undefined;
    if (args.zip_output_path) {
      const zipPath = validatePath(args.zip_output_path);
      const zipDir = path.dirname(zipPath);
      if (!fs.existsSync(zipDir)) {
        fs.mkdirSync(zipDir, { recursive: true });
      }

      const zip = new JSZip();
      for (const filePath of savedFiles) {
        const fileContent = fs.readFileSync(filePath);
        zip.file(path.basename(filePath), fileContent);
      }

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      fs.writeFileSync(zipPath, zipBuffer);
      savedZipPath = zipPath;
      logger.info(`파비콘 ZIP 압축 완료: ${zipPath}`);
    }

    logger.info(`파비콘 세트 생성 완료: ${outputDir}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            output_dir: outputDir,
            saved_files: savedFiles.map((f) => path.basename(f)),
            zip_path: savedZipPath,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`파비콘 생성 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
