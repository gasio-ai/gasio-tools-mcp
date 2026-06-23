/**
 * handlers/video2gif.ts
 * MP4/MOV → GIF 변환 핸들러
 * fluent-ffmpeg + ffmpeg-static (사전 포함 바이너리) 사용
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { assertFileExists, ensureOutputDir, toErrorResult } from "../security.js";
import { logger } from "../logger.js";

interface Video2GifArgs {
  input_path: string;
  output_path: string;
  start_time: number;
  duration: number;
  fps?: number;
  width?: number;
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

export async function handleVideo2Gif(args: Video2GifArgs): Promise<ToolResult> {
  try {
    assertFileExists(args.input_path);
    const outputPath = ensureOutputDir(args.output_path);

    const fps = args.fps ?? 10;
    const width = args.width ?? 480;

    // ffmpeg-static 바이너리 경로를 fluent-ffmpeg에 주입
    if (!ffmpegStatic) {
      throw new Error("ffmpeg-static 바이너리를 찾을 수 없습니다. npm install을 다시 실행해 주세요.");
    }
    ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

    logger.info(`Video→GIF 변환 시작: ${args.input_path} (start=${args.start_time}s, dur=${args.duration}s)`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(args.input_path)
        .setStartTime(args.start_time)
        .setDuration(args.duration)
        .outputOptions([
          // 두 패스 팔레트 생성으로 GIF 품질 극대화
          `-vf fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`,
          "-loop 0",
        ])
        .output(outputPath)
        .on("start", (cmd: string) => logger.debug(`ffmpeg 명령: ${cmd}`))
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    logger.info(`Video→GIF 변환 완료: ${outputPath}`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            saved_path: outputPath,
            bridge_url: `https://video2gif.gasio.com/?import=true&source=mcp&file=${encodeURIComponent(outputPath)}`,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`Video→GIF 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
