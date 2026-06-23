/**
 * handlers/exifclean.ts
 * piexifjs + jimp를 이용한 이미지 EXIF 메타데이터 제거 및 SEO 최적화 핸들러 (100% 로컬)
 */

import piexif from "piexifjs";
import fs from "fs";
import path from "path";
import { Jimp } from "jimp";
import { validatePath, assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

interface SeotMetadata {
  description?: string;
  artist?: string;
  copyright?: string;
}

interface ExifCleanArgs {
  input_path: string;
  output_path: string;
  remove_all?: boolean;
  seo_metadata?: SeotMetadata;
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleExifCleaner(args: ExifCleanArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);
    const inputPath = validatePath(args.input_path);
    const outputPath = ensureOutputDir(args.output_path);
    const removeAll = args.remove_all ?? true;

    logger.info(`EXIF 메타 삭제/편집 시작: ${inputPath} → ${outputPath}`);

    const ext = path.extname(inputPath).toLowerCase();
    const isJpeg = ext === ".jpg" || ext === ".jpeg";

    if (isJpeg) {
      // JPEG 포맷: piexifjs 사용하여 로컬 정밀 삭제 및 삽입
      const base64Data = fs.readFileSync(inputPath).toString("base64");
      let jpegData = "data:image/jpeg;base64," + base64Data;

      if (removeAll) {
        jpegData = piexif.remove(jpegData);
        logger.info("모든 EXIF 메타데이터 제거 완료 (JPEG)");
      }

      if (args.seo_metadata) {
        const zeroth: any = {};
        const exif: any = {};
        const gps: any = {};

        if (args.seo_metadata.description) {
          zeroth[piexif.ImageIFD.ImageDescription] = args.seo_metadata.description;
        }
        if (args.seo_metadata.artist) {
          zeroth[piexif.ImageIFD.Artist] = args.seo_metadata.artist;
        }
        if (args.seo_metadata.copyright) {
          zeroth[piexif.ImageIFD.Copyright] = args.seo_metadata.copyright;
        }

        const exifObj = { "0th": zeroth, "Exif": exif, "GPS": gps };
        const exifBytes = piexif.dump(exifObj);
        jpegData = piexif.insert(exifBytes, jpegData);
        logger.info("SEO 커스텀 EXIF 메타데이터 삽입 완료 (JPEG)");
      }

      const cleanBase64 = jpegData.replace(/^data:image\/jpeg;base64,/, "");
      fs.writeFileSync(outputPath, Buffer.from(cleanBase64, "base64"));
    } else {
      // PNG 및 기타 포맷: Jimp로 읽었다가 다시 저장하는 방식으로 EXIF 제거 대안 적용 (Jimp 저장 시 부가 메타데이터가 탈락함)
      logger.info(`비-JPEG 이미지 포맷(${ext}) 감지. Jimp를 통해 메타데이터를 정제하여 저장합니다.`);
      const image = await Jimp.read(inputPath);
      await image.write(outputPath as `${string}.${string}`);

      if (args.seo_metadata) {
        logger.warn("비-JPEG 이미지 포맷은 EXIF 규격 메타데이터 주입을 지원하지 않습니다. 제거 처리만 완료되었습니다.");
      }
    }

    logger.info(`EXIF 메타 제어 완료: ${outputPath}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            saved_path: outputPath,
            format: isJpeg ? "JPEG" : "OTHER",
            exif_removed: removeAll,
            seo_metadata_injected: !!args.seo_metadata && isJpeg,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`EXIF 제어 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
