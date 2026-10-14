/**
 * Task Analyzer and SubAgent Synthesizer for DeepSeek Harness MCP Server.
 * Analyzes tasks, detects affected subsystems, recommends targeted verification checks,
 * and synthesizes execution directives for multi-session concurrency.
 * @module @deepseek-ai/dsh-mcp-server
 */

/** Options for analyzing a task in the MCP server. */
export interface AnalyzeOptions {
  /** Execution mode override (`direct`, `subagent`, or `auto`). */
  mode?: 'direct' | 'subagent' | 'auto' | undefined
  /** Optional package or directory scope hint. */
  scope?: string | undefined
}

/** Synthesized execution plan and subagent specification for a task. */
export interface SubagentPlan {
  category: 'feature' | 'bugfix' | 'testing' | 'refactor' | 'research'
  categoryName: string
  executionMode: 'direct' | 'subagent'
  subagentName: string
  role: string
  description: string
  enableWriteTools: boolean
  detectedSubsystems: string[]
  recommendedChecks: string[]
  systemPrompt: string
  actionablePrompt: string
  directExecutionGuidelines: string
  defineSubagentPayload: {
    name: string
    description: string
    system_prompt: string
    enable_write_tools: boolean
    enable_subagent_tools: boolean
    enable_mcp_tools: boolean
  }
  invokeSubagentPayload: {
    Subagents: Array<{
      TypeName: string
      Role: string
      Model: string
      Prompt: string
    }>
  }
}

interface SubsystemRule {
  readonly id: string
  readonly keywords: readonly string[]
  readonly checkCommand: string
}

const SUBSYSTEM_RULES: readonly SubsystemRule[] = [
  { id: 'packages/mcp', keywords: ['mcp', 'mcp-server', 'mcp-client', 'mcp-resources', 'run_harness_task'], checkCommand: 'pnpm vitest run packages/mcp' },
  { id: 'packages/core', keywords: ['agent-loop', 'toolruntime', 'ctx.tools', 'system-prompt', 'core/'], checkCommand: 'pnpm vitest run packages/core' },
  { id: 'packages/llm', keywords: ['llm', 'deepseek', 'adapter', 'provider', 'streamchunk', 'toolcallid'], checkCommand: 'pnpm vitest run packages/llm' },
  { id: 'packages/session', keywords: ['session', 'jsonl', 'persistence', 'working-directory'], checkCommand: 'pnpm vitest run packages/session' },
  { id: 'packages/shell', keywords: ['shell', 'bash', 'pwsh', 'powershell'], checkCommand: 'pnpm vitest run packages/shell' },
  { id: 'packages/subprocess', keywords: ['subprocess', 'child_process', 'win32-process'], checkCommand: 'pnpm vitest run packages/subprocess' },
  { id: 'packages/fs', keywords: ['fs-local', 'fs-sandbox', 'tool-fs', 'str-replace'], checkCommand: 'pnpm vitest run packages/fs' },
  { id: 'packages/client', keywords: ['client', 'ui-', 'react', 'sidebar', 'composer', 'css'], checkCommand: 'pnpm vitest run packages/client' },
  { id: 'packages/host', keywords: ['webserver', 'directory-picker', 'plugin-inventory', 'host/'], checkCommand: 'pnpm vitest run packages/host' },
  { id: 'packages/sdk', keywords: ['sdk', 'json-rpc'], checkCommand: 'pnpm vitest run packages/sdk' },
  { id: 'packages/subagent', keywords: ['subagent', 'sub-agent', 'agent phụ'], checkCommand: 'pnpm vitest run packages/subagent' },
  { id: 'scripts', keywords: ['script', 'gate', 'verify-', 'hygiene', 'doc-sync'], checkCommand: 'pnpm run doc-sync' },
  { id: 'docs', keywords: ['doc', 'readme', 'markdown', 'tài liệu'], checkCommand: 'pnpm run test:docs' },
]

const BUG_KEYWORDS = [
  'bug', 'fix', 'error', 'fail', 'crash', 'issue', 'broken', 'regression',
  'lỗi', 'sửa', 'hỏng', 'khắc phục', 'vá', 'sửa lỗi', 'bị lỗi',
]

const TEST_KEYWORDS = [
  'test', 'spec', 'vitest', 'coverage', 'assert', 'kiểm thử', 'unit test', 'e2e',
  'check', 'verify', 'audit', 'inspect', 'review',
  'kiểm tra', 'xác thực', 'soát', 'đánh giá', 'thẩm định',
]

const REFACTOR_KEYWORDS = [
  'refactor', 'clean', 'optimize', 'tối ưu', 'tái cấu trúc', 'simplif',
  'dọn dẹp', 'restructure', 'cải tiến', 'update', 'sync', 'upgrade', 'cập nhật', 'đồng bộ',
]

const RESEARCH_KEYWORDS = [
  'explain', 'search', 'find', 'why', 'how', 'investigate',
  'tìm hiểu', 'giải thích', 'nghiên cứu', 'khảo sát', 'tra cứu', 'thắc mắc', 'tại sao', 'như thế nào', 'hướng dẫn',
]

const EXPLICIT_SUBAGENT_KEYWORDS = [
  'subagent', 'sub-agent', 'agent phụ', 'chạy nền', 'background agent',
  'spawn subagent', 'invoke subagent', 'tạo subagent', 'tạo agent phụ', 'chạy agent riêng',
]

/**
 * Analyzes a task string and synthesizes an execution plan, subsystem scope, and optional SubAgent specification.
 * @param task - User task or prompt text to classify.
 * @param options - Optional mode and scope overrides.
 * @returns The synthesized execution plan and subagent configuration.
 */
export function analyzeTaskAndSynthesizeSubagent(
  task: string,
  options: AnalyzeOptions = {},
): SubagentPlan {
  const lower = `${task} ${options.scope ?? ''}`.toLowerCase()

  // 1. Detect Category
  let category: SubagentPlan['category'] = 'feature'
  let categoryName = 'Feature Development & Implementation'
  let subagentName = 'dsh_feature_engineer'
  let role = 'DeepSeek Feature Engineer'
  let description = 'Specialized engineer for implementing features and extensions in DeepSeek Harness'
  let enableWriteTools = true

  if (BUG_KEYWORDS.some(kw => lower.includes(kw))) {
    category = 'bugfix'
    categoryName = 'Bug Investigation & Invariant Repair'
    subagentName = 'dsh_bug_hunter'
    role = 'DeepSeek Bug Hunter & Invariant Specialist'
    description = 'Specialist in diagnosing, isolating, and fixing defects while maintaining DeepSeek Harness invariants'
    enableWriteTools = true
  } else if (TEST_KEYWORDS.some(kw => lower.includes(kw))) {
    category = 'testing'
    categoryName = 'Quality Assurance & System Verification'
    subagentName = 'dsh_test_architect'
    role = 'DeepSeek QA & Verification Architect'
    description = 'Specialist in writing robust Vitest test suites, snapshot tests, real-composition specs, and system verification'
    enableWriteTools = true
  } else if (REFACTOR_KEYWORDS.some(kw => lower.includes(kw))) {
    category = 'refactor'
    categoryName = 'Architectural Refactoring & Modernization'
    subagentName = 'dsh_architecture_refactorer'
    role = 'DeepSeek Systems Architect'
    description = 'Specialist in refactoring packages, streamlining Cordis plugins, and enforcing capability seams'
    enableWriteTools = true
  } else if (RESEARCH_KEYWORDS.some(kw => lower.includes(kw))) {
    category = 'research'
    categoryName = 'Codebase Research & Architecture Exploration'
    subagentName = 'dsh_codebase_researcher'
    role = 'DeepSeek Codebase Researcher'
    description = 'Specialist in surveying repository structure, dependencies, Cordis topology, and documentation'
    enableWriteTools = false
  }

  // 2. Detect Affected Subsystems & Targeted Verification Checks
  const detectedSubsystems: string[] = []
  const recommendedChecks: string[] = []
  for (const rule of SUBSYSTEM_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      detectedSubsystems.push(rule.id)
      if (!recommendedChecks.includes(rule.checkCommand)) {
        recommendedChecks.push(rule.checkCommand)
      }
    }
  }
  if (detectedSubsystems.length === 0) {
    detectedSubsystems.push('workspace-general')
  }
  if (recommendedChecks.length === 0 && category !== 'research') {
    recommendedChecks.push('pnpm run typecheck')
  }

  // 3. Detect Execution Mode (Direct Execution vs SubAgent Delegation)
  let executionMode: SubagentPlan['executionMode'] = 'direct'
  if (options.mode === 'subagent') {
    executionMode = 'subagent'
  } else if (options.mode === 'direct') {
    executionMode = 'direct'
  } else if (EXPLICIT_SUBAGENT_KEYWORDS.some(kw => lower.includes(kw))) {
    executionMode = 'subagent'
  }

  // 4. Synthesize Standardized System Prompt & Guidelines
  const baseSystemGuidelines = `1. Architectural Discipline: Respect Cordis service architecture. Services default-export their class; function plugins named-export (name, inject, Config, apply).
2. Type Safety & Contracts: Maintain strict TypeScript typings (strict: true, noImplicitAny, no assertions to unknown) and concise JSDoc (@param/@returns).
3. Invariant Integrity: Preserve capability seams (Service Definition / Provider / Consumer) and explicit ctx.effect() / ctx.on() disposers.
4. Targeted Verification: Run focused checks (${recommendedChecks.join(', ') || 'targeted vitest'}) matching the changed surface.
5. Concise Reporting: Provide clickable file links (file://) and clear summaries.`

  let specializedGuidelines = ''
  switch (category) {
    case 'bugfix':
      specializedGuidelines = `- Trace the failure to its root cause before editing.
- Add or run focused regression tests to verify the fix.
- Apply minimal, surgical changes that preserve backward compatibility.`
      break
    case 'testing':
      specializedGuidelines = `- Run focused tests, builds, and gate checks to verify behavior.
- Mock only external or non-deterministic boundaries; guarantee clean teardown.`
      break
    case 'refactor':
      specializedGuidelines = `- Streamline implementation while preserving public contracts and capability seams.
- Keep one asynchronous operation mapped to one lifecycle controller.`
      break
    case 'research':
      specializedGuidelines = `- Inspect code systematically using read-only tools.
- Trace service bindings and plugin topologies in Cordis with file:// citations.`
      break
    case 'feature':
      specializedGuidelines = `- Build modular, cohesive code following DeepSeek Harness conventions.
- Update package tsconfig, exports, JSDoc, and focused unit/composition tests.`
      break
  }

  const systemPrompt = `You are a standardized DeepSeek Harness Engineer.\n${baseSystemGuidelines}\n\nCategory Focus (${categoryName}):\n${specializedGuidelines}`

  const actionablePrompt = `Execute the following task strictly following DeepSeek Harness engineering standards:
Task Description: "${task}"
Detected Subsystems: ${detectedSubsystems.join(', ')}
Recommended Verification: ${recommendedChecks.join(' && ') || 'N/A (read-only research)'}`

  const directExecutionGuidelines = `${baseSystemGuidelines}\n\n### Category Focus (${categoryName}):\n${specializedGuidelines}`

  return {
    category,
    categoryName,
    executionMode,
    subagentName,
    role,
    description,
    enableWriteTools,
    detectedSubsystems,
    recommendedChecks,
    systemPrompt,
    actionablePrompt,
    directExecutionGuidelines,
    defineSubagentPayload: {
      name: subagentName,
      description,
      system_prompt: systemPrompt,
      enable_write_tools: enableWriteTools,
      enable_subagent_tools: false,
      enable_mcp_tools: true,
    },
    invokeSubagentPayload: {
      Subagents: [
        {
          TypeName: subagentName,
          Role: role,
          Model: 'inherit',
          Prompt: actionablePrompt,
        },
      ],
    },
  }
}

/**
 * Formats the SubagentPlan into a concise markdown directive for MCP tool output.
 * In direct mode (default), omits bulky subagent JSON payloads to save context tokens.
 * @param task - Original task description.
 * @param plan - Synthesized execution plan from {@link analyzeTaskAndSynthesizeSubagent}.
 * @returns Formatted markdown guidance for the calling agent.
 */
export function formatMcpAnalysisResponse(task: string, plan: SubagentPlan): string {
  const checksLine = plan.recommendedChecks.length > 0
    ? plan.recommendedChecks.map(cmd => `\`${cmd}\``).join(', ')
    : 'Read-only inspection (no build/test required)'

  if (plan.executionMode === 'subagent') {
    return `# 🚀 DeepSeek Harness — Task Analysis & SubAgent Orchestration

## 📋 1. Task Assessment
- **Input Task**: "${task}"
- **Discipline**: ${plan.categoryName} (\`${plan.category}\`)
- **Execution Mode**: 🤖 **SubAgent Delegation (Explicitly Requested)**
- **Assigned Persona**: \`${plan.subagentName}\` (${plan.role})
- **Detected Subsystems**: ${plan.detectedSubsystems.map(s => `\`${s}\``).join(', ')}
- **Recommended Checks**: ${checksLine}
- **Write Permissions**: ${plan.enableWriteTools ? 'Enabled (`enable_write_tools: true`)' : 'Read-only (`enable_write_tools: false`)'}

## 🤖 2. Standardized SubAgent Specification

### SubAgent Definition Parameters (\`define_subagent\`):
\`\`\`json
${JSON.stringify(plan.defineSubagentPayload, null, 2)}
\`\`\`

### SubAgent Invocation Parameters (\`invoke_subagent\`):
\`\`\`json
${JSON.stringify(plan.invokeSubagentPayload, null, 2)}
\`\`\`

## ⚡ 3. DELEGATION ACTIONS FOR PARENT AGENT
1. Call \`define_subagent\` using the JSON parameters above.
2. Call \`invoke_subagent\` with the synthesized Subagents array.
3. Supervise & summarize the deliverable upon completion.
`
  }

  return `# 🚀 DeepSeek Harness — Task Analysis & SubAgent Orchestration

## 📋 1. Task Assessment
- **Input Task**: "${task}"
- **Discipline**: ${plan.categoryName} (\`${plan.category}\`)
- **Execution Mode**: ⚡ **Direct Execution (Multi-Session Optimized)** — Zero subagent overhead.
- **Assigned Persona**: \`${plan.subagentName}\` (${plan.role})
- **Detected Subsystems**: ${plan.detectedSubsystems.map(s => `\`${s}\``).join(', ')}
- **Recommended Checks**: ${checksLine}

## 🛠️ 2. DIRECT IN-SESSION EXECUTION DIRECTIVE
${plan.directExecutionGuidelines}

## ⚡ 3. EXECUTION INSTRUCTIONS FOR CURRENT AGENT
- **Default Path (Fast & Concurrency-Safe)**: Execute immediately in this session using workspace tools (\`view_file\`, \`replace_file_content\`, \`write_to_file\`, \`run_command\`). **DO NOT** call \`define_subagent\` or \`invoke_subagent\` unless explicitly requested by the user.
- **On-Demand SubAgent**: If you later need full subagent JSON payloads, call \`run_harness_task\` with \`mode: "subagent"\`.
`
}
