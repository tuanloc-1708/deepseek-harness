# Agent Note: MCP Server Bridge

Status: implemented

[English](2026-09-07-mcp-server-bridge.md) | 中文

通过 Model Context Protocol (MCP) stdio JSON-RPC 将 registered Harness 工具暴露在 `ctx.tools` 上。

## 概要

`@deepseek-ai/dsh-mcp-server` 包使用 `@modelcontextprotocol/sdk` 将 Cordis 工具注册表桥接到外部 MCP 客户端（例如 Antigravity IDE、VS Code 或 Cursor）。

- 通过 `tsdown.config.ts` 将 `bin.ts` 编译为 `lib/bin.js`。
- 在 `package.json` 中导出 `"dsh-mcp-server"` 二进制入口点。
- 在进程入口处将 `console.log` 和 `console.info` 重定向到 `console.error`，以保护 stdio JSON-RPC 传输的纯净度。
