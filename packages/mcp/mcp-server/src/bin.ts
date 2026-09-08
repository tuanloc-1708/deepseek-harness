#!/usr/bin/env node

/**
 * Executable entrypoint for booting DeepSeek Harness as an MCP server over stdio.
 */

// Ensure stdout remains pure for stdio JSON-RPC transport
console.log = console.error
console.info = console.error
console.warn = console.error
console.debug = console.error
console.trace = console.error

process.on('uncaughtException', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0)
  console.error('Uncaught exception in dsh-mcp-server:', err)
})

process.stdout.on('error', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0)
})

import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { McpServerService } from './index.ts'

const ctx = new Context()
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolRuntime)
await ctx.plugin(McpServerService, {
  name: 'deepseek-harness',
  version: '0.1.0',
})

const mcpService = ctx.get('mcpServer') as McpServerService
await mcpService.startStdio()
