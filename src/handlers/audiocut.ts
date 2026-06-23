/**
 * handlers/audiocut.ts
 * MP3/WAV/M4A 오디오 구간 편집 핸들러
 * fluent-ffmpeg + ffmpeg-static 사용
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

interface AudioCutArgs {
  input_path: string;
  output_path: string;
  start_ms: number;
  end_ms: number;
  fade_in?: boolean;
  fade_out?: boolean;
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleAudioCut(args: AudioCutArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);
    const outputPath = ensureOutputDir(args.output_path);

    if (args.start_ms < 0 || args.end_ms <= args.start_ms) {
      throw new Error(`유효하지 않은 시간 범위: start_ms=${args.start_ms}, end_ms=${args.end_ms}`);
    }

    if (!ffmpegStatic) {
      throw new Error("ffmpeg-static 바이너리를 찾을 수 없습니다. npm install을 다시 실행해 주세요.");
    }
    ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

    const startSec = args.start_ms / 1000;
    const durationSec = (args.end_ms - args.start_ms) / 1000;

    logger.info(`오디오 편집 시작: ${args.input_path} (${args.start_ms}ms ~ ${args.end_ms}ms)`);

    // 오디오 필터 구성
    const audioFilters: string[] = [];
    if (args.fade_in) {
      audioFilters.push(`afade=t=in:st=0:d=1`);
    }
    if (args.fade_out) {
      const fadeOutStart = Math.max(0, durationSec - 1);
      audioFilters.push(`afade=t=out:st=${fadeOutStart}:d=1`);
    }

    await new Promise<void>((resolve, reject) => {
      let cmd = ffmpeg(args.input_path)
        .setStartTime(startSec)
        .setDuration(durationSec);

      if (audioFilters.length > 0) {
        cmd = cmd.audioFilters(audioFilters);
      }

      cmd
        .output(outputPath)
        .on("start", (c: string) => logger.debug(`ffmpeg 명령: ${c}`))
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    logger.info(`오디오 편집 완료: ${outputPath}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            saved_path: outputPath,
            duration_sec: durationSec,
            fade_in: args.fade_in ?? false,
            fade_out: args.fade_out ?? false,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`오디오 편집 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
