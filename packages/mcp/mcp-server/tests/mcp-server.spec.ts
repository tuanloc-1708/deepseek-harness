import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { McpServerService } from '../src/index.ts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

describe('dsh-mcp-server', () => {
  it('exposes registered Harness tools via MCP protocol', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(McpServerService, { name: 'test-mcp-server', version: '1.0.0' })

    // Register a test tool on Harness
    ctx.tools.register(
      defineTool({
        name: 'add_numbers',
        description: 'Adds two numbers together',
        parameters: {
          a: { type: 'number', required: true, description: 'First number' },
          b: { type: 'number', required: true, description: 'Second number' },
        },
        output: {
          schema: { type: 'json' },
          render: (_args, val) => [{ type: 'text', text: `Result: ${val}` }],
        },
        execute: async (args) => {
          const sum = Number(args.a) + Number(args.b)
          return sum
        },
      }),
    )

    // Connect MCP client via InMemoryTransport
    const mcpService = ctx.get('mcpServer') as McpServerService
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client({ name: 'test-client', version: '1.0.0' })
    await mcpService.server.connect(serverTransport)
    await client.connect(clientTransport)

    // 1. Assert tool listing
    const toolsResult = await client.listTools()
    expect(toolsResult.tools).toHaveLength(1)
    expect(toolsResult.tools[0]?.name).toBe('add_numbers')
    expect(toolsResult.tools[0]?.description).toContain('Adds two numbers together')

    // 2. Assert tool execution
    const callResult = (await client.callTool({
      name: 'add_numbers',
      arguments: { a: 10, b: 20 },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean }

    expect(callResult.isError).toBeFalsy()
    expect(callResult.content).toHaveLength(1)
    expect(callResult.content[0]).toEqual({ type: 'text', text: 'Result: 30' })
  })
})
