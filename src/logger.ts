/**
 * logger.ts
 * MCP 표준 준수: stdout은 JSON-RPC 전용 채널입니다.
 * 모든 디버그/에러 로그는 반드시 stderr로만 출력합니다.
 * console.log() 사용 절대 금지.
 */

const LOG_PREFIX = "[gasio-mcp]";

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    process.stderr.write(`${LOG_PREFIX} INFO  ${message} ${args.length ? JSON.stringify(args) : ""}\n`);
  },
  warn: (message: string, ...args: unknown[]) => {
    process.stderr.write(`${LOG_PREFIX} WARN  ${message} ${args.length ? JSON.stringify(args) : ""}\n`);
  },
  error: (message: string, ...args: unknown[]) => {
    process.stderr.write(`${LOG_PREFIX} ERROR ${message} ${args.length ? JSON.stringify(args) : ""}\n`);
  },
  debug: (message: string, ...args: unknown[]) => {
    if (process.env.GASIO_DEBUG === "true") {
      process.stderr.write(`${LOG_PREFIX} DEBUG ${message} ${args.length ? JSON.stringify(args) : ""}\n`);
    }
  },
};
