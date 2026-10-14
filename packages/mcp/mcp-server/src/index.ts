/**
 * MCP server bridge plugin: exposes registered Harness tools on `ctx.tools`
 * and architectural task analysis over Model Context Protocol (MCP) stdio JSON-RPC.
 * @module @deepseek-ai/dsh-mcp-server
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { McpServer, type Tool } from '@modelcontextprotocol/server'
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'
import { analyzeTaskAndSynthesizeSubagent, formatMcpAnalysisResponse } from './task-analyzer.ts'
export { analyzeTaskAndSynthesizeSubagent, formatMcpAnalysisResponse }
export type { SubagentPlan, AnalyzeOptions } from './task-analyzer.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mcpServer: McpServerService
  }
}

/** Configuration for the MCP server service. */
export interface Config {
  /** Server implementation name advertised during MCP initialization. */
  name?: string
  /** Server implementation version advertised during MCP initialization. */
  version?: string
}

/** Cordis plugin name for the MCP server bridge. */
export const name = 'mcp-server'
/** Required Cordis services for the MCP server bridge. */
export const inject = ['tools']

/**
 * Mount the MCP server service into the current Cordis context.
 * @param ctx - Cordis context carrying `ctx.tools`.
 * @param config - Optional server name and version configuration.
 */
export function apply(ctx: Context, config: Config = {}): void {
  ctx.plugin(McpServerService, config)
}

const RUN_HARNESS_TASK_TOOL: Tool = {
  name: 'run_harness_task',
  description: '[DEEPSEEK HARNESS ENGINE] Task analyzer and architecture advisor for DeepSeek Harness. Analyzes tasks, detects affected subsystems, recommends targeted verification checks, and provides direct execution or optional subagent directives.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task or prompt to analyze and execute' },
      mode: {
        type: 'string',
        enum: ['direct', 'subagent', 'auto'],
        description: 'Optional execution mode. Defaults to auto (direct in-session execution without subagents unless requested)',
      },
      scope: {
        type: 'string',
        description: 'Optional package or directory scope hint (e.g. packages/mcp, packages/core)',
      },
    },
    required: ['task'],
  },
}

/**
 * Cordis service that bridges `ctx.tools` and `run_harness_task` onto an MCP `McpServer`.
 */
export class McpServerService extends Service {
  static readonly inject = ['tools']

  static readonly Config: z<Config> = z.object({
    name: z.string().default('deepseek-harness'),
    version: z.string().default('0.2.1-alpha.3'),
  })

  /** Underlying MCP server instance. */
  readonly server: McpServer
  private callSeq = 0

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'mcpServer')

    const serverName = config.name ?? 'deepseek-harness'
    const serverVersion = config.version ?? '0.2.1-alpha.3'

    this.server = new McpServer(
      { name: serverName, version: serverVersion },
      { capabilities: { tools: { listChanged: true } } },
    )

    this.setupHandlers()
  }

  private setupHandlers(): void {
    this.server.server.setRequestHandler('tools/list', () => {
      const schemas = this.ctx.tools.schemas()
      const tools: Tool[] = schemas.map(s => ({
        name: s.name,
        description: s.description,
        inputSchema: s.parameters as Tool['inputSchema'],
      }))

      // Always expose run_harness_task unless overridden by a registered tool of the same name
      if (!tools.some(t => t.name === RUN_HARNESS_TASK_TOOL.name)) {
        tools.push(RUN_HARNESS_TASK_TOOL)
      }

      return { tools }
    })

    this.server.server.setRequestHandler('tools/call', async (request, context) => {
      const { name: toolName, arguments: rawArgs } = request.params
      const args: Record<string, unknown> = isRecord(rawArgs) ? rawArgs : {}

      if (toolName === 'run_harness_task') {
        const taskText = typeof args.task === 'string' ? args.task.trim() : ''
        if (!taskText) {
          return {
            content: [{ type: 'text' as const, text: 'Error: `task` parameter must be a non-empty string.' }],
            isError: true,
          }
        }
        const mode = args.mode === 'direct' || args.mode === 'subagent' || args.mode === 'auto'
          ? args.mode
          : undefined
        const scope = typeof args.scope === 'string' ? args.scope : undefined
        const plan = analyzeTaskAndSynthesizeSubagent(taskText, { mode, scope })
        const responseText = formatMcpAnalysisResponse(taskText, plan)
        return {
          content: [{ type: 'text' as const, text: responseText }],
          isError: false,
        }
      }

      const callId = ToolCallId(`mcp-${Date.now()}-${++this.callSeq}`)
      const controller = new AbortController()
      const requestSignal = context.mcpReq.signal

      if (requestSignal.aborted) {
        controller.abort(requestSignal.reason)
      } else {
        requestSignal.addEventListener('abort', () => {
          controller.abort(requestSignal.reason)
        }, { once: true })
      }

      const result = await this.ctx.tools.execute({
        name: toolName,
        arguments: args,
        callId,
        signal: controller.signal,
      })

      if (result.isError) {
        const text = result.content
          .map(b => (b.type === 'text' ? b.text : JSON.stringify(b)))
          .join('\n') || result.error.message || 'Tool execution failed'
        return {
          content: [{ type: 'text' as const, text }],
          isError: true,
        }
      }

      const contentBlocks: Array<{ type: 'text'; text: string }> = []

      if (result.content.length > 0) {
        for (const block of result.content) {
          if (block.type === 'text') {
            contentBlocks.push({ type: 'text', text: block.text })
          } else {
            contentBlocks.push({ type: 'text', text: JSON.stringify(block) })
          }
        }
      } else {
        const text = typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2)
        contentBlocks.push({ type: 'text', text })
      }

      return {
        content: contentBlocks,
        isError: false,
      }
    })
  }

  /**
   * Connect the MCP server to a `StdioServerTransport` over process stdin/stdout.
   * Automatically exits when the client closes stdin or the transport terminates.
   * @returns Promise that resolves once the stdio transport is connected.
   */
  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport()
    transport.onclose = () => {
      process.exit(0)
    }
    transport.onerror = (err: Error) => {
      console.error('MCP StdioServerTransport error:', err)
    }
    await this.server.connect(transport)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default McpServerService
