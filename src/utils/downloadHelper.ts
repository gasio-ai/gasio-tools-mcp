import fs from "fs";
import path from "path";
import https from "https";
import { logger } from "../logger.js";

// self-signed certificate 에러 우회를 위한 설정 주입
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/**
 * URL에서 대상 경로로 파일을 다운로드합니다.
 * 디렉토리가 존재하지 않으면 자동으로 생성합니다.
 * 
 * @param url 다운로드할 리소스의 원격 URL
 * @param dest 로컬에 저장할 파일 절대 경로
 * @param name 콘솔 로그에 표시할 리소스 이름
 */
export function downloadFile(url: string, dest: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 디렉토리 자동 생성
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    if (fs.existsSync(dest)) {
      logger.info(`[download] 이미 존재하여 다운로드를 건너뜁니다 [${name}]: ${path.basename(dest)}`);
      resolve();
      return;
    }

    logger.info(`[download] 다운로드 시작 [${name}]: ${url}`);
    
    // MCP stdout 오염을 방지하기 위해 stderr에 즉각 진행 상황 노출
    process.stderr.write(`[download] 다운로드 중 [${name}] -> ${path.basename(dest)}...\n`);
    
    const file = fs.createWriteStream(dest);

    const request = (targetUrl: string) => {
      https.get(targetUrl, (res) => {
        // HTTP 리다이렉트 처리 (301, 302)
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (!location) {
            reject(new Error(`리다이렉트 주소를 찾지 못함: ${targetUrl}`));
            return;
          }
          request(location);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP 오류 ${res.statusCode}: ${targetUrl}`));
          return;
        }

        res.pipe(file);
        
        file.on("finish", () => {
          file.close();
          const sizeMB = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
          const completionMsg = `[download] 완료 [${name}]: ${path.basename(dest)} (${sizeMB}MB)\n`;
          process.stderr.write(completionMsg);
          logger.info(`[download] 완료 [${name}]: ${path.basename(dest)} (${sizeMB}MB)`);
          resolve();
        });
      }).on("error", (err: Error) => {
        fs.unlink(dest, () => {}); // 실패한 임시 파일 제거
        reject(err);
      });
    };

    request(url);
  });
}
