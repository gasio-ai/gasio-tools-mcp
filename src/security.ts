/**
 * security.ts
 * Path Traversal 차단 및 파일 경로 보안 검증 공통 유틸리티
 * 모든 핸들러에서 입력 경로를 처리하기 전에 반드시 이 모듈을 통해 검증합니다.
 */

import path from "path";
import os from "os";
import fs from "fs";

// 접근을 허용할 최상위 디렉토리 목록
const ALLOWED_ROOTS = [
  os.homedir(),          // ~/
  os.tmpdir(),           // /tmp 또는 %TEMP%
  "/tmp",
];

/**
 * 입력 경로를 보안 검증하고 정규화된 절대 경로를 반환합니다.
 * @throws 경로가 허용되지 않는 영역을 참조할 경우 Error를 throw
 */
export function validatePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("경로가 비어있거나 유효하지 않습니다.");
  }

  // 상위 디렉토리 참조 명시 차단 (정규화 전 raw 문자열 검사)
  if (inputPath.includes("../") || inputPath.includes("..\\")) {
    throw new Error(`상위 경로 참조(..)가 포함된 경로는 허용되지 않습니다: ${inputPath}`);
  }

  const resolved = path.resolve(inputPath);

  // 허용된 루트 디렉토리 내에 포함되는지 검증
  const isAllowed = ALLOWED_ROOTS.some((root) => resolved.startsWith(root));
  if (!isAllowed) {
    throw new Error(
      `접근 제한 영역입니다. 홈 디렉토리(${os.homedir()}) 또는 시스템 임시 폴더 내 경로만 허용됩니다.\n요청 경로: ${resolved}`
    );
  }

  return resolved;
}

/**
 * 입력 파일이 실제로 존재하는지 검증합니다.
 */
export function assertFileExists(filePath: string): void {
  const resolved = validatePath(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`파일을 찾을 수 없습니다: ${resolved}`);
  }
}

/**
 * 출력 경로의 디렉토리가 존재하지 않으면 자동으로 생성합니다.
 */
export function ensureOutputDir(outputPath: string): string {
  const resolved = validatePath(outputPath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return resolved;
}

/**
 * MCP 표준 에러 응답 형식으로 에러를 래핑합니다.
 */
export function toErrorResult(error: unknown): { isError: true; content: Array<{ type: "text"; text: string }> } {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `오류: ${message}` }],
  };
}
