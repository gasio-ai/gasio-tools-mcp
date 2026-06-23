import fs from "fs";
import path from "path";
import os from "os";
import https from "https";
import { randomUUID } from "crypto";

const GASIO_HOME = path.join(os.homedir(), ".gasio");
const USAGE_FILE = path.join(GASIO_HOME, "mcp_usage.json");

// 14개 개별 도구별 전용 서브도메인 맵핑 정보 (공식 도메인 구성표 기준)
const SERVICE_DOMAINS: Record<string, string> = {
  "gasio_png_to_svg": "png2svg.gasio.com",
  "gasio_video_to_gif": "video2gif.gasio.com",
  "gasio_screenshot_mockup": "screenshot.gasio.com",
  "gasio_audio_cut": "audiocut.gasio.com",
  "gasio_image_to_text_ocr": "img2text.gasio.com",
  "gasio_qrcode_generator": "qrcode.gasio.com",
  "gasio_css_generator": "css.gasio.com",
  "gasio_remove_background": "removebg.gasio.com",
  "gasio_object_eraser": "eraserimg.gasio.com",
  "gasio_image_upscaler": "upscale.gasio.com",
  "gasio_image_resizer": "resizeimg.gasio.com",
  "gasio_image_converter": "convertimg.gasio.com",
  "gasio_favicon_generator": "favicongen.gasio.com",
  "gasio_exif_cleaner": "exifclean.gasio.com"
};

interface ToolUsage {
  count: number;
  last_used: string;
}

interface SessionData {
  is_verified: boolean;
  expires_at: string | null;
  challenge_id?: string;
}

interface UsageConfig {
  tools: Record<string, ToolUsage>;
  session: SessionData;
}

// 초기 기본 설정값 생성
const DEFAULT_CONFIG: UsageConfig = {
  tools: {},
  session: {
    is_verified: false,
    expires_at: null
  }
};

// UUID 생성 헬퍼
function generateUUID(): string {
  try {
    return randomUUID();
  } catch {
    // Fallback random uuid
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

// 설정 파일 읽기
function readConfig(): UsageConfig {
  try {
    if (!fs.existsSync(GASIO_HOME)) {
      fs.mkdirSync(GASIO_HOME, { recursive: true });
    }
    if (!fs.existsSync(USAGE_FILE)) {
      fs.writeFileSync(USAGE_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
      return DEFAULT_CONFIG;
    }
    const content = fs.readFileSync(USAGE_FILE, "utf8");
    return JSON.parse(content);
  } catch {
    return DEFAULT_CONFIG;
  }
}

// 설정 파일 저장
function writeConfig(config: UsageConfig) {
  try {
    if (!fs.existsSync(GASIO_HOME)) {
      fs.mkdirSync(GASIO_HOME, { recursive: true });
    }
    fs.writeFileSync(USAGE_FILE, JSON.stringify(config, null, 2), "utf8");
  } catch (e) {
    // Write 실패는 무시 또는 대체 처리
  }
}

// tools.gasio.com 통합 백엔드로 실시간 챌린지 인증 상태 조회 (Node.js HTTPS)
function fetchChallengeStatus(challengeId: string): Promise<string> {
  return new Promise((resolve) => {
    // 리다이렉트 프록시를 통해 tools.gasio.com/api/mcp/check?id=... 로 호출
    const url = `https://tools.gasio.com/api/mcp/check?id=${challengeId}`;
    
    https.get(url, { timeout: 3000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.status || "pending");
        } catch {
          resolve("pending");
        }
      });
    }).on("error", () => {
      resolve("pending"); // 네트워크 에러 시 대기 상태 유지
    });
  });
}

/**
 * MCP 도구 실행 전 사용 한도 및 갱신 세션 상태를 검사합니다.
 * @param toolName 실행하려는 MCP 도구명
 * @param logFn 디버그 디테일을 출력하기 위한 logger callback
 * @returns {Promise<boolean>} 활성화 통과 여부 (true = 연산 가능, false = 연산 차단 및 갱신 필요)
 */
export async function verifyUsageAndSession(
  toolName: string,
  logFn: (msg: string) => void
): Promise<{ pass: boolean; message?: string }> {
  const config = readConfig();
  const now = new Date();

  // 1. 이미 24시간 세션 인증이 유효한 상태인지 체크
  if (config.session.is_verified && config.session.expires_at) {
    const expiresAt = new Date(config.session.expires_at);
    if (expiresAt > now) {
      // 세션 유효함: 통과
      return { pass: true };
    }
  }

  // 2. 도구별 오늘 사용 카운트 조회
  const todayStr = now.toISOString().split("T")[0];
  const toolUsage = config.tools[toolName] || { count: 0, last_used: "" };
  const lastUsedDay = toolUsage.last_used.split("T")[0];

  let currentCount = toolUsage.count;
  if (lastUsedDay !== todayStr) {
    // 날짜가 바뀌었으면 카운트 리셋
    currentCount = 0;
  }

  // 3. 한도(2회) 이내인 경우 카운트 증가 및 통과
  if (currentCount < 2) {
    toolUsage.count = currentCount + 1;
    toolUsage.last_used = now.toISOString();
    config.tools[toolName] = toolUsage;
    writeConfig(config);
    return { pass: true };
  }

  // 4. 한도 초과 시: 챌린지 생성 및 웹 방문 유도 차단
  let challengeId = config.session.challenge_id;
  if (!challengeId) {
    challengeId = generateUUID();
    config.session.challenge_id = challengeId;
    config.session.is_verified = false;
    config.session.expires_at = null;
    writeConfig(config);
  }

  const targetDomain = SERVICE_DOMAINS[toolName] || "tools.gasio.com";
  const verifyUrl = `https://${targetDomain}/verify?id=${challengeId}`;
  
  logFn(`[Session] 무료 로컬 사용 임계치(2회)가 초과되었습니다.`);
  logFn(`[Session] 계속 연산하기 위해 브라우저에서 아래 갱신 링크를 1회 접속해 주세요:`);
  logFn(`[Session] 👉 ${verifyUrl}`);
  logFn(`[Session] 웹 인증 대기 중... (브라우저로 활성화 완료 시 자동으로 도구가 재개됩니다)`);

  // 5. 백그라운드 HTTP 폴링 시작 (최대 5분(300초) 대기, 3초 간격)
  const pollInterval = 3000;
  const maxAttempts = 100; // 300초
  let attempts = 0;

  while (attempts < maxAttempts) {
    await new Promise((r) => setTimeout(r, pollInterval));
    attempts++;

    const status = await fetchChallengeStatus(challengeId);
    
    if (status === "verified") {
      // 갱신 성공: 세션 연장 및 카운트 리셋
      const expiry = new Date();
      expiry.setHours(expiry.getHours() + 24); // 24시간 연장

      config.session.is_verified = true;
      config.session.expires_at = expiry.toISOString();
      config.session.challenge_id = undefined; // 챌린지 제거

      // 사용 횟수 리셋
      if (config.tools[toolName]) {
        config.tools[toolName].count = 0;
      }
      
      writeConfig(config);
      logFn(`[Session] ✅ 웹 인증 감지 완료! 로컬 사용량이 24시간 동안 제한 없이 연장되었습니다.`);
      return { pass: true };
    }

    if (attempts % 10 === 0) {
      logFn(`[Session] 인증 대기 중... (갱신 링크: ${verifyUrl})`);
    }
  }

  // 5분 초과 시 세션 만료 에러
  // 다음 시도를 위해 챌린지 아이디 리셋
  config.session.challenge_id = undefined;
  writeConfig(config);

  const timeoutMsg = `세션 활성화 대기 시간이 초과되었습니다 (5분).\n\n` +
    `해결 가이드:\n` +
    `도구를 다시 실행하고 5분 이내에 브라우저에 표시된 갱신 링크(${verifyUrl})를 방문하여 '로컬 도구 세션 활성화' 버튼을 완료해 주세요.`;

  return {
    pass: false,
    message: timeoutMsg
  };
}
