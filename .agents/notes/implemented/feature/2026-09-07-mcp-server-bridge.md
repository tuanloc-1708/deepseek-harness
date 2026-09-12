# Agent Note: MCP Server Bridge

Status: implemented

English | [中文](2026-09-07-mcp-server-bridge.zh.md)

Exposes registered Harness tools on `ctx.tools` over Model Context Protocol (MCP) stdio JSON-RPC.

## Summary

The `@deepseek-ai/dsh-mcp-server` package bridges Cordis tool registries to external MCP clients (such as Antigravity IDE, VS Code, or Cursor) using `@modelcontextprotocol/sdk`.

- Compiles `bin.ts` into `lib/bin.js` via `tsdown.config.ts`.
- Exports `"dsh-mcp-server"` binary entrypoint in `package.json`.
- Redirects `console.log` and `console.info` to `console.error` at process entry to protect stdio JSON-RPC transport purity.
