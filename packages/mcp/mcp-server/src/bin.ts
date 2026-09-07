#!/usr/bin/env node

/**
 * Executable entrypoint for booting DeepSeek Harness as an MCP server over stdio.
 */

// Ensure stdout remains pure for stdio JSON-RPC transport
console.log = console.error
console.info = console.error

import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { McpServerService } from './index.ts'

const ctx = new Context()
ctx.plugin(SystemPrompt)
ctx.plugin(ToolRuntime)

const mcpService = new McpServerService(ctx, {
  name: 'deepseek-harness',
  version: '0.1.0',
})
await mcpService.startStdio()
