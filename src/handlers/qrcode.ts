/**
 * handlers/qrcode.ts
 * QR 코드 생성 핸들러 (+ 중앙 로고 합성)
 * qrcode (pure-js) + jimp (pure-js) 사용
 */

import fs from "fs";
import QRCode from "qrcode";
import { Jimp } from "jimp";
import { validatePath, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

interface QRCodeArgs {
  text: string;
  output_path: string;
  logo_path?: string;
  color_dark?: string;
  color_light?: string;
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleQRCodeGenerator(args: QRCodeArgs): Promise<ToolResult> {
  try {
    if (!args.text || args.text.trim().length === 0) {
      throw new Error("인코딩할 텍스트가 비어있습니다.");
    }

    const outputPath = ensureOutputDir(args.output_path);
    const colorDark = args.color_dark ?? "#000000";
    const colorLight = args.color_light ?? "#ffffff";

    logger.info(`QR 코드 생성 시작: "${args.text.slice(0, 50)}..."`);

    // QR 코드를 PNG Buffer로 생성
    const qrBuffer = await QRCode.toBuffer(args.text, {
      type: "png",
      width: 512,
      margin: 2,
      color: {
        dark: colorDark,
        light: colorLight,
      },
      errorCorrectionLevel: "H", // 로고 합성 시 30% 손상 허용을 위해 H 레벨 필수
    });

    // 로고 합성 여부에 따라 분기
    if (args.logo_path) {
      const logoPath = validatePath(args.logo_path);
      if (!fs.existsSync(logoPath)) {
        throw new Error(`로고 파일을 찾을 수 없습니다: ${logoPath}`);
      }

      const qrImage = await Jimp.fromBuffer(qrBuffer);
      const logo = await Jimp.read(logoPath);

      const qrSize = qrImage.bitmap.width;
      // 로고 크기는 QR 코드의 25% 이하로 제한 (오류 복원율 확보)
      const logoSize = Math.floor(qrSize * 0.25);
      logo.resize({ w: logoSize, h: logoSize });

      const logoX = Math.floor((qrSize - logoSize) / 2);
      const logoY = Math.floor((qrSize - logoSize) / 2);

      qrImage.composite(logo, logoX, logoY);
      await qrImage.write(outputPath as `${string}.${string}`);
    } else {
      // 로고 없음: QR 버퍼 직접 파일에 저장
      fs.writeFileSync(outputPath, qrBuffer);
    }

    logger.info(`QR 코드 생성 완료: ${outputPath}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            saved_path: outputPath,
            has_logo: !!args.logo_path,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`QR 코드 생성 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
