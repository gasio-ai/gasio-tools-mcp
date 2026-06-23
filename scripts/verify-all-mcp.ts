/**
 * scripts/verify-all-mcp.ts
 * 배포 전 15개 MCP 도구 전체를 Stdio JSON-RPC로 호출하여 정상 동작하는지 검증하는 통합 테스트 러너.
 */

import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { Jimp } from "jimp";
import ffmpegPath from "ffmpeg-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERIFY_DIR = path.join(os.tmpdir(), "gasio-verify-assets");
const INPUT_PNG = path.join(VERIFY_DIR, "input.png");
const MASK_PNG = path.join(VERIFY_DIR, "mask.png");
const INPUT_MP3 = path.join(VERIFY_DIR, "input.mp3");
const INPUT_MP4 = path.join(VERIFY_DIR, "input.mp4");
const SERVER_JS = path.resolve(__dirname, "../src/index.js");

interface TestCase {
  name: string;
  arguments: Record<string, any>;
  verify: (response: any) => boolean;
}

// ─── 1. 더미 테스트 에셋 생성 ──────────────────────────────────────────────────
async function prepareAssets() {
  console.log(`[Verify] 1. 테스트용 임시 디렉토리 생성: ${VERIFY_DIR}`);
  if (!fs.existsSync(VERIFY_DIR)) {
    fs.mkdirSync(VERIFY_DIR, { recursive: true });
  }

  // 1-1. 더미 이미지 생성 (Jimp)
  console.log("[Verify] 1-1. Jimp로 더미 PNG 및 마스크 PNG 생성 중...");
  // 100x100 빨간색 더미 이미지
  const img = new Jimp({ width: 100, height: 100, color: 0xff0000ff });
  await img.write(INPUT_PNG as `${string}.${string}`);

  // 중앙에 하얀 사각형이 있는 마스크 이미지
  const mask = new Jimp({ width: 100, height: 100, color: 0x000000ff });
  // 중앙 20x20 영역을 하얗게 칠함 (RGBA: 0xffffffff)
  for (let x = 40; x < 60; x++) {
    for (let y = 40; y < 60; y++) {
      mask.setPixelColor(0xffffffff, x, y);
    }
  }
  await mask.write(MASK_PNG as `${string}.${string}`);

  // 1-2. 더미 오디오 및 비디오 생성 (ffmpeg-static)
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static 경로를 찾을 수 없습니다.");
  }
  console.log(`[Verify] 1-2. ffmpeg-static(${ffmpegPath})으로 더미 MP3/MP4 생성 중...`);
  
  // 2초짜리 무음 MP3 생성
  execSync(`"${ffmpegPath}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t 2 "${INPUT_MP3}"`, { stdio: "ignore" });
  
  // 2초짜리 검은 화면 MP4 생성
  execSync(`"${ffmpegPath}" -y -f lavfi -i color=c=black:s=160x120:r=10 -f lavfi -i anullsrc=r=44100:cl=mono -t 2 -pix_fmt yuv420p "${INPUT_MP4}"`, { stdio: "ignore" });

  console.log("[Verify] 에셋 생성 완료!");
}

// ─── 2. JSON-RPC MCP 서버 연동 테스트 클라이언트 ──────────────────────────────
class MCPVerifyClient {
  private child: any;
  private messageId = 1;
  private responseBuffer = "";
  private pendingRequests: Record<number, (res: any) => void> = {};

  constructor() {}

  async start() {
    return new Promise<void>((resolve, reject) => {
      this.child = spawn("node", [SERVER_JS]);
      
      this.child.stdout.on("data", (data: Buffer) => {
        this.responseBuffer += data.toString();
        this.processBuffer();
      });

      this.child.stderr.on("data", (data: Buffer) => {
        // 서버 로그는 테스트 러너에서 출력
        const logLine = data.toString().trim();
        if (logLine) {
          console.log(`[Server Log] ${logLine}`);
        }
      });

      this.child.on("close", (code: number) => {
        if (code !== 0 && code !== null) {
          console.error(`[Server] 프로세스가 종료되었습니다 (Exit Code: ${code})`);
        }
      });

      // 서버가 기동될 시간을 잠시 준 후 완료
      setTimeout(() => resolve(), 1000);
    });
  }

  private processBuffer() {
    const lines = this.responseBuffer.split("\n");
    // 마지막 줄은 불완전할 수 있으므로 보관
    this.responseBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const response = JSON.parse(trimmed);
        if (response.id && this.pendingRequests[response.id]) {
          const resolve = this.pendingRequests[response.id];
          delete this.pendingRequests[response.id];
          resolve(response);
        }
      } catch (err) {
        console.error("[Client] JSON-RPC 응답 파싱 실패:", trimmed);
      }
    }
  }

  async call(method: string, params: Record<string, any>): Promise<any> {
    const id = this.messageId++;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve) => {
      this.pendingRequests[id] = resolve;
      this.child.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  async stop() {
    if (this.child) {
      this.child.kill();
    }
  }
}

// ─── 3. 테스트 케이스 정의 ──────────────────────────────────────────────────────
const getTestCases = (): TestCase[] => [
  {
    name: "1. gasio_png_to_svg",
    arguments: {
      input_path: INPUT_PNG,
      output_path: path.join(VERIFY_DIR, "output.svg"),
      color_mode: "monochrome",
      threshold: 128,
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "2. gasio_video_to_gif",
    arguments: {
      input_path: INPUT_MP4,
      output_path: path.join(VERIFY_DIR, "output.gif"),
      start_time: 0,
      duration: 1,
      fps: 5,
      width: 160,
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "3. gasio_screenshot_mockup",
    arguments: {
      input_path: INPUT_PNG,
      output_path: path.join(VERIFY_DIR, "output_mockup.png"),
      device_type: "iphone",
      bg_type: "solid",
      bg_color: "#ffffff",
      padding: 10,
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "4. gasio_audio_cut",
    arguments: {
      input_path: INPUT_MP3,
      output_path: path.join(VERIFY_DIR, "output.mp3"),
      start_ms: 0,
      end_ms: 1000,
      fade_in: true,
      fade_out: true,
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "5. gasio_image_to_text_ocr",
    arguments: {
      input_path: INPUT_PNG,
      lang: "eng",
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      // 더미 빨간색 이미지에 텍스트가 없어도 ocr 프로세싱 자체는 에러 없이 success가 떨어져야 함
      return parsed.success === true && typeof parsed.text === "string";
    },
  },
  {
    name: "6. gasio_qrcode_generator",
    arguments: {
      text: "https://tools.gasio.com",
      output_path: path.join(VERIFY_DIR, "output_qr.png"),
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "7. gasio_css_generator",
    arguments: {
      style_type: "glassmorphism",
      glass_blur: 15,
      glass_opacity: 0.2,
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && typeof parsed.css_code === "string";
    },
  },
  {
    name: "8. gasio_remove_background",
    arguments: {
      input_path: INPUT_PNG,
      output_path: path.join(VERIFY_DIR, "output_nobg.png"),
      model_preset: "small", // 빠른 테스트를 위해 small 프리셋 사용
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "9. gasio_object_eraser",
    arguments: {
      input_path: INPUT_PNG,
      mask_path: MASK_PNG,
      output_path: path.join(VERIFY_DIR, "output_erased.png"),
      radius: 3,
      method: "telea",
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "10. gasio_image_upscaler (super-resolution)",
    arguments: {
      input_path: INPUT_PNG,
      output_path: path.join(VERIFY_DIR, "output_upscale_sr.png"),
      scale: 2,
      model_type: "super-resolution",
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path) && parsed.method === "onnx-super-resolution";
    },
  },
  {
    name: "10-2. gasio_image_upscaler (realesrgan)",
    arguments: {
      input_path: INPUT_PNG,
      output_path: path.join(VERIFY_DIR, "output_upscale_re.png"),
      scale: 4,
      model_type: "realesrgan",
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path) && parsed.method === "onnx-realesrgan";
    },
  },
  {
    name: "11. gasio_image_resizer",
    arguments: {
      input_path: INPUT_PNG,
      output_path: path.join(VERIFY_DIR, "output_resized.png"),
      width: 50,
      mode: "resize",
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "12. gasio_image_converter",
    arguments: {
      input_path: INPUT_PNG,
      output_path: path.join(VERIFY_DIR, "output_converted.jpg"),
      quality: 90,
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "13. gasio_favicon_generator",
    arguments: {
      input_path: INPUT_PNG,
      output_dir: path.join(VERIFY_DIR, "favicons"),
      zip_output_path: path.join(VERIFY_DIR, "favicons.zip"),
      app_name: "TestApp",
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.zip_path);
    },
  },
  {
    name: "14. gasio_exif_cleaner",
    arguments: {
      input_path: INPUT_PNG,
      output_path: path.join(VERIFY_DIR, "output_cleanexif.png"),
      remove_all: true,
    },
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.success === true && fs.existsSync(parsed.saved_path);
    },
  },
  {
    name: "15. gasio_check_setup",
    arguments: {},
    verify: (res) => {
      const parsed = JSON.parse(res.result.content[0].text);
      return parsed.isSetupComplete === true;
    },
  },
];

// ─── 4. 테스트 메인 실행 루프 ────────────────────────────────────────────────────
async function runTests() {
  console.log("\n[Verify] 2. MCP 서버 기동 중...");
  const client = new MCPVerifyClient();
  await client.start();
  
  // MCP 프로토콜 초기화 핸드셰이크
  console.log("[Verify] 3. MCP 프로토콜 초기화 전송...");
  const initRes = await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-verifier", version: "1.0.0" },
  });
  
  if (!initRes.result || initRes.result.protocolVersion !== "2024-11-05") {
    console.error("[Verify] ❌ MCP 초기화 핸드셰이크 실패!");
    await client.stop();
    process.exit(1);
  }
  console.log("[Verify] ✅ MCP 초기화 완료!");

  // 테스트 케이스 실행
  console.log("\n[Verify] 4. 15대 도구 시나리오 전수 검사 시작\n");
  const testCases = getTestCases();
  let passedCount = 0;

  for (const tc of testCases) {
    process.stdout.write(`Testing [${tc.name}] ... `);
    try {
      const res = await client.call("tools/call", {
        name: tc.name.split(" ")[1].replace(" (super-resolution)", "").replace(" (realesrgan)", ""),
        arguments: tc.arguments,
      });

      if (res.error) {
        process.stdout.write(`❌ FAIL (Server Error: ${res.error.message})\n`);
      } else if (res.result && res.result.isError) {
        process.stdout.write(`❌ FAIL (Tool Error: ${res.result.content[0].text})\n`);
      } else if (tc.verify(res)) {
        process.stdout.write("✅ SUCCESS\n");
        passedCount++;
      } else {
        process.stdout.write("❌ FAIL (Validation Failed)\n");
      }
    } catch (err: any) {
      process.stdout.write(`❌ CRASH (Exception: ${err.message})\n`);
    }
  }

  console.log(`\n[Verify] 5. MCP 테스트 결과 요약: ${passedCount} / ${testCases.length} 통과`);
  
  await client.stop();
  
  // ─── 5. 청소 ────────────────────────────────────────────────────────────
  console.log(`[Verify] 6. 테스트 임시 디렉토리 청소 중: ${VERIFY_DIR}`);
  try {
    fs.rmSync(VERIFY_DIR, { recursive: true, force: true });
    console.log("[Verify] 청소 완료!");
  } catch (err) {
    console.error("[Verify] 청소 중 실패:", err);
  }

  if (passedCount === testCases.length) {
    console.log("\n🚀 [Verify] 15종 전수 테스트 완벽 성공! 배포 준비 완료!\n");
    process.exit(0);
  } else {
    console.error("\n🔴 [Verify] 일부 테스트가 실패했습니다. 코드를 점검하십시오.\n");
    process.exit(1);
  }
}

async function main() {
  try {
    await prepareAssets();
    await runTests();
  } catch (err) {
    console.error("[Verify] 치명적 오류 발생:", err);
    process.exit(1);
  }
}

main();
