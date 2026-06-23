/**
 * handlers/cssgen.ts
 * Glassmorphism / Mesh Gradient CSS 코드 생성 핸들러
 * 외부 라이브러리 의존성 없음 - 순수 TypeScript 템플릿 생성
 * 파일 저장 없이 CSS 텍스트를 MCP TextContent로 직접 반환
 */

import { toErrorResult } from "../security.js";
import { logger } from "../logger.js";

type StyleType = "glassmorphism" | "mesh_gradient";

interface CssGeneratorArgs {
  style_type: StyleType;
  glass_blur?: number;
  glass_opacity?: number;
  mesh_colors?: string[];
}

type ToolResult =
  | { isError: true; content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }> };

/**
 * Glassmorphism CSS 생성
 */
function generateGlassmorphism(blur: number, opacity: number): { css: string; html: string } {
  const blurPx = Math.max(0, Math.min(100, blur));
  const alpha = Math.max(0, Math.min(1, opacity));

  const css = `.glass-card {
  /* Glassmorphism Effect */
  background: rgba(255, 255, 255, ${alpha});
  -webkit-backdrop-filter: blur(${blurPx}px);
  backdrop-filter: blur(${blurPx}px);
  border: 1px solid rgba(255, 255, 255, ${Math.min(1, alpha + 0.2)});
  border-radius: 16px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.glass-card-dark {
  /* Glassmorphism Dark Variant */
  background: rgba(0, 0, 0, ${alpha});
  -webkit-backdrop-filter: blur(${blurPx}px);
  backdrop-filter: blur(${blurPx}px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}`;

  const html = `<!-- Glassmorphism 배경 컨테이너 -->
<div style="min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; padding: 20px;">
  <div class="glass-card" style="padding: 32px; max-width: 400px; width: 100%;">
    <h2 style="margin: 0 0 16px; color: white;">Glass Card</h2>
    <p style="margin: 0; color: rgba(255,255,255,0.8);">
      Glassmorphism 효과가 적용된 카드 컴포넌트입니다.
    </p>
  </div>
</div>`;

  return { css, html };
}

/**
 * Mesh Gradient CSS 생성
 */
function generateMeshGradient(colors: string[]): { css: string; html: string } {
  // 색상 배열 기본값 설정
  const palette =
    colors.length >= 4
      ? colors.slice(0, 4)
      : ["#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3"];

  const [c1, c2, c3, c4] = palette;

  const css = `.mesh-gradient-bg {
  /* Mesh Gradient Background */
  min-height: 100vh;
  background-color: ${c1};
  background-image:
    radial-gradient(ellipse at 20% 20%, ${c1}cc 0%, transparent 50%),
    radial-gradient(ellipse at 80% 10%, ${c2}cc 0%, transparent 50%),
    radial-gradient(ellipse at 10% 80%, ${c3}cc 0%, transparent 50%),
    radial-gradient(ellipse at 90% 90%, ${c4}cc 0%, transparent 50%);
  background-attachment: fixed;
}

@keyframes mesh-shift {
  0%   { background-position: 0% 50%;   }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%;   }
}

.mesh-gradient-animated {
  background-size: 400% 400%;
  animation: mesh-shift 8s ease infinite;
}`;

  const html = `<!-- Mesh Gradient 배경 -->
<div class="mesh-gradient-bg mesh-gradient-animated">
  <!-- 여기에 컨텐츠를 배치하세요 -->
</div>`;

  return { css, html };
}

export async function handleCssGenerator(args: CssGeneratorArgs): Promise<ToolResult> {
  try {
    logger.info(`CSS 생성: style_type=${args.style_type}`);

    let css: string;
    let html: string;

    if (args.style_type === "glassmorphism") {
      const result = generateGlassmorphism(
        args.glass_blur ?? 20,
        args.glass_opacity ?? 0.1
      );
      css = result.css;
      html = result.html;
    } else if (args.style_type === "mesh_gradient") {
      const result = generateMeshGradient(args.mesh_colors ?? []);
      css = result.css;
      html = result.html;
    } else {
      throw new Error(`지원하지 않는 style_type: ${args.style_type}. "glassmorphism" 또는 "mesh_gradient"만 허용됩니다.`);
    }

    logger.info(`CSS 생성 완료 (${css.length}자)`);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: true,
            style_type: args.style_type,
            css_code: css,
            html_snippet: html,
          }),
        },
      ],
    };
  } catch (error) {
    logger.error(`CSS 생성 오류: ${error instanceof Error ? error.message : String(error)}`);
    return toErrorResult(error);
  }
}
