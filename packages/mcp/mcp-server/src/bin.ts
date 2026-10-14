/**
 * Executable entrypoint for booting DeepSeek Harness as an MCP server over stdio.
 * @module @deepseek-ai/dsh-mcp-server/bin
 */

// Redirect all non-error console output to stderr so stdout remains pure for stdio JSON-RPC frames
console.log = console.error
console.info = console.error
console.warn = console.error
console.debug = console.error
console.trace = console.error

function handleFatalPipeError(err: unknown): void {
  if (typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'EPIPE') {
    process.exit(0)
  }
  console.error('Uncaught exception in dsh-mcp-server:', err)
}

process.on('uncaughtException', handleFatalPipeError)
process.stdout.on('error', handleFatalPipeError)

// Prevent orphaned MCP server processes when parent IDE session closes stdin or sends termination signals
process.stdin.on('end', () => process.exit(0))
process.stdin.on('close', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))

import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { McpServerService } from './index.ts'

const ctx = new Context()
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolRuntime)
await ctx.plugin(McpServerService, {
  name: 'deepseek-harness',
  version: '0.2.1-alpha.3',
})

await ctx.mcpServer.startStdio()
