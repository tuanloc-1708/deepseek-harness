import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import { McpServerService } from '../src/index.ts'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'

describe('dsh-mcp-server', () => {
  it('exposes registered Harness tools alongside run_harness_task via MCP protocol', async () => {
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
          render: (_args, val) => [{ type: 'text', text: `Result: ${JSON.stringify(val)}` }],
        },
        execute: args => Promise.resolve(args.a + args.b),
      }),
    )

    // Connect MCP client via InMemoryTransport
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client({ name: 'test-client', version: '1.0.0' })
    await ctx.mcpServer.server.connect(serverTransport)
    await client.connect(clientTransport)

    // 1. Assert tool listing includes both registered tool and run_harness_task
    const toolsResult = await client.listTools()
    const toolNames = toolsResult.tools.map(t => t.name)
    expect(toolNames).toContain('add_numbers')
    expect(toolNames).toContain('run_harness_task')
    const addTool = toolsResult.tools.find(t => t.name === 'add_numbers')
    expect(addTool?.description).toBe('Adds two numbers together')

    // 2. Assert tool execution
    const callResult = (await client.callTool({
      name: 'add_numbers',
      arguments: { a: 10, b: 20 },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean }

    expect(callResult.isError).toBeFalsy()
    expect(callResult.content).toHaveLength(1)
    expect(callResult.content[0]).toEqual({ type: 'text', text: 'Result: 30' })
  })

  it('forwards client abort signal to tool execution', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(McpServerService, { name: 'test-mcp-server', version: '1.0.0' })

    let signalAborted = false
    ctx.tools.register(
      defineTool({
        name: 'long_running_task',
        description: 'Long running task',
        parameters: {},
        output: {
          schema: { type: 'json' },
          render: (_args, val) => [{ type: 'text', text: JSON.stringify(val) }],
        },
        execute: async (_args, meta) => {
          return new Promise((_resolve, reject) => {
            if (meta.signal?.aborted) {
              signalAborted = true
              reject(new Error('Aborted'))
              return
            }
            meta.signal?.addEventListener('abort', () => {
              signalAborted = true
              reject(new Error('Aborted'))
            })
          })
        },
      }),
    )

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client({ name: 'test-client', version: '1.0.0' })
    await ctx.mcpServer.server.connect(serverTransport)
    await client.connect(clientTransport)

    const controller = new AbortController()
    const callPromise = client.callTool(
      { name: 'long_running_task', arguments: {} },
      { signal: controller.signal },
    )

    await new Promise(resolve => setTimeout(resolve, 20))
    controller.abort()
    await expect(callPromise).rejects.toThrow()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(signalAborted).toBe(true)
  })

  it('analyzes task, detects subsystems, and synthesizes guidance via run_harness_task', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(McpServerService, { name: 'test-mcp-server', version: '1.0.0' })

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const client = new Client({ name: 'test-client', version: '1.0.0' })
    await ctx.mcpServer.server.connect(serverTransport)
    await client.connect(clientTransport)

    // Call run_harness_task for a bugfix task
    const bugResult = (await client.callTool({
      name: 'run_harness_task',
      arguments: { task: 'Fix crash and broken invariant in session persistence' },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean }

    expect(bugResult.isError).toBeFalsy()
    expect(bugResult.content[0]?.text).toContain('DeepSeek Harness — Task Analysis & SubAgent Orchestration')
    expect(bugResult.content[0]?.text).toContain('dsh_bug_hunter')
    expect(bugResult.content[0]?.text).toContain('packages/session')
    expect(bugResult.content[0]?.text).toContain('define_subagent')
    expect(bugResult.content[0]?.text).toContain('invoke_subagent')

    // Call run_harness_task for a feature task
    const featResult = (await client.callTool({
      name: 'run_harness_task',
      arguments: { task: 'Add new webhook listener and create plugin' },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean }

    expect(featResult.isError).toBeFalsy()
    expect(featResult.content[0]?.text).toContain('dsh_feature_engineer')
    expect(featResult.content[0]?.text).toContain('Feature Development & Implementation')

    // Call run_harness_task for a verification/QA task in Vietnamese
    const verifyResult = (await client.callTool({
      name: 'run_harness_task',
      arguments: { task: 'kiểm tra lại cấu hình mcp-server xem đã đúng chưa' },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean }

    expect(verifyResult.isError).toBeFalsy()
    expect(verifyResult.content[0]?.text).toContain('dsh_test_architect')
    expect(verifyResult.content[0]?.text).toContain('Quality Assurance & System Verification')
    expect(verifyResult.content[0]?.text).toContain('packages/mcp')

    // Call run_harness_task for a research task
    const researchResult = (await client.callTool({
      name: 'run_harness_task',
      arguments: { task: 'giải thích cơ chế hoạt động của Cordis service trong DeepSeek Harness' },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean }

    expect(researchResult.isError).toBeFalsy()
    expect(researchResult.content[0]?.text).toContain('dsh_codebase_researcher')
    expect(researchResult.content[0]?.text).toContain('Codebase Research & Architecture Exploration')
    expect(researchResult.content[0]?.text).toContain('Direct Execution (Multi-Session Optimized)')
    expect(researchResult.content[0]?.text).toContain('**DO NOT** call `define_subagent`')

    // Call run_harness_task with explicit subagent mode
    const explicitSubagentResult = (await client.callTool({
      name: 'run_harness_task',
      arguments: { task: 'chạy subagent để nghiên cứu sâu kiến trúc Cordis', mode: 'subagent' },
    })) as { content: Array<{ type: string; text: string }>; isError?: boolean }

    expect(explicitSubagentResult.isError).toBeFalsy()
    expect(explicitSubagentResult.content[0]?.text).toContain('SubAgent Delegation (Explicitly Requested)')
    expect(explicitSubagentResult.content[0]?.text).toContain('Call `define_subagent`')
  })
})
