# mcp-server — expose Harness tools and task analysis as an MCP server

English | [中文](README.zh.md)

This package provides an MCP (Model Context Protocol) server bridge for DeepSeek Harness. It dynamically exposes all tools registered on `ctx.tools` alongside the built-in `run_harness_task` architectural analyzer over stdio JSON-RPC.

## Usage

Start the server using the compiled binary or mount `dsh-mcp-server` into a Cordis composition:

```sh
node packages/mcp/mcp-server/lib/bin.js
```
