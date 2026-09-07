# mcp-server — expose Harness tools as an MCP server

English | [中文](README.zh.md)

This package provides an MCP (Model Context Protocol) server bridge for DeepSeek Harness. It dynamically projects all tools registered on `ctx.tools` as MCP tools and serves programmatic clients (such as Antigravity IDE) over stdio JSON-RPC.

## Usage

Start the server using `bin.ts` or mount `dsh-mcp-server` into a Cordis composition:

```sh
npx tsx packages/mcp/mcp-server/src/bin.ts
```
