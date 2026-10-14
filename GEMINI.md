# DeepSeek Harness Workflow Protocol (Multi-Session Optimized)

## ⚡ AGENT BEHAVIOR GUIDELINES — READ BEFORE EVERY TURN

To maximize performance, support multiple concurrent sessions smoothly, and eliminate subagent queuing stalls:

### 1. Direct In-Session Execution by Default (Zero SubAgent Overhead)
- For regular user requests, bugfixes, features, testing, code inspections, or questions:
  The agent **MUST execute directly within the current session** using standard tools (`view_file`, `replace_file_content`, `write_to_file`, `run_command`, etc.).
- **DO NOT** spawn a subagent (`define_subagent` / `invoke_subagent`) unless:
  1. The user explicitly requests a subagent / background agent (e.g. "dùng subagent", "chạy subagent", "spawn subagent", "run in background").
  2. The task explicitly requires heavy isolated background processing.
- **Why this is critical**: Spawning subagents across multiple concurrent sessions saturates LLM rate limits (TPM/RPM), creates background queue stalls, and severely lags work progress. Direct in-session execution is 10x faster, lightweight, and concurrency-safe.

### 2. Optional Architectural Guidance (`run_harness_task`)
- If needed, the agent may consult the DeepSeek Harness MCP engine for architectural assessment by calling `call_mcp_tool`:
  - `ServerName`: "deepseek-harness"
  - `ToolName`: "run_harness_task"
  - `Arguments`: { "task": "<user prompt>" }
- By default, `run_harness_task` returns **Direct Execution Directives**. Proceed directly with workspace tools in the current session.

### 3. DeepSeek Harness Engineering Standards
When executing tasks directly, strictly enforce:
1. **Architectural Discipline**: Respect Cordis service architecture. Services default-export their class; function plugins named-export (`name`, `inject`, `Config`, `apply`).
2. **Type Safety & Contracts**: Maintain strict TypeScript typings. Do not introduce runtime loose types or regressions.
3. **Invariant Integrity**: Do not violate package invariants. Preserve capability seams and explicit lifecycle transactions.
4. **Comprehensive Verification**: Verify all edits using Vitest tests or build checks when applicable.
5. **Concise Reporting**: Keep communication concise, providing clickable file links (`file://`) and clear summaries.
