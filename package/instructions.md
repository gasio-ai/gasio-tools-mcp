# Instructions for @gasio/mcp-server

You are using the `@gasio/mcp-server` which provides 14 local offline media processing tools.

## CRITICAL: Initial Setup Required
Before calling any media processing tools (such as background removal, image upscaler, or OCR), you must verify that the offline resources (AI models and language packs) are successfully downloaded.

1. You should check the setup status by calling the tool `gasio_check_setup` first.
2. If `gasio_check_setup` returns `isSetupComplete: false`, or if any tool fails due to missing model files:
   - You MUST run `mcp-server setup` (if you have shell execution capabilities) or explicitly ask the user to run it in their terminal.
   - Do NOT execute media tools until this command is executed, as they will fail without the model files in `~/.gasio/`.
