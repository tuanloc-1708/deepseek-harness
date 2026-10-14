import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const mcpServerDir = path.join(rootDir, 'packages', 'mcp', 'mcp-server').replace(/\\/g, '/');
const binPath = path.join(rootDir, 'packages', 'mcp', 'mcp-server', 'lib', 'bin.js').replace(/\\/g, '/');

if (!fs.existsSync(binPath)) {
  console.error(`❌ Error: MCP server binary not found at ${binPath}`);
  console.error('👉 Please run "pnpm --filter @deepseek-ai/dsh-mcp-server build" or "pnpm run build:artifacts" first.');
  process.exit(1);
}

const targetConfigs = [
  path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json'),
  path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json'),
  path.join(os.homedir(), '.gemini', 'antigravity-ide', 'mcp_config.json'),
];

const schemaDirs = [
  path.join(os.homedir(), '.gemini', 'antigravity', 'mcp', 'deepseek-harness'),
  path.join(os.homedir(), '.gemini', 'antigravity-ide', 'mcp', 'deepseek-harness'),
];

const toolSchema = {
  name: 'run_harness_task',
  description: '[DEEPSEEK HARNESS ENGINE] Task analyzer and architecture advisor for DeepSeek Harness. Analyzes tasks, detects affected subsystems, recommends targeted verification checks, and provides direct execution or optional subagent directives.',
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'The task or prompt to analyze and execute',
      },
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
};

try {
  for (const configFile of targetConfigs) {
    const configDir = path.dirname(configFile);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let config = { mcpServers: {} };
    if (fs.existsSync(configFile)) {
      const raw = fs.readFileSync(configFile, 'utf-8').trim();
      if (raw) {
        try {
          config = JSON.parse(raw);
        } catch {
          config = { mcpServers: {} };
        }
        if (!config.mcpServers) config.mcpServers = {};
      }
    }

    config.mcpServers['deepseek-harness'] = {
      command: 'node',
      args: [binPath],
      cwd: mcpServerDir,
    };

    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ Configured MCP server in: ${configFile}`);
  }

  const pluginMcpConfig = path.join(rootDir, '.agents', 'plugins', 'deepseek-harness', 'mcp_config.json');
  fs.mkdirSync(path.dirname(pluginMcpConfig), { recursive: true });
  fs.writeFileSync(
    pluginMcpConfig,
    JSON.stringify(
      {
        mcpServers: {
          'deepseek-harness': {
            command: 'node',
            args: ['./packages/mcp/mcp-server/lib/bin.js'],
          },
        },
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
  console.log(`✅ Updated workspace plugin MCP config: ${pluginMcpConfig}`);

  const instructionsContent = `# DeepSeek Harness MCP Server Instructions

## Engine Overview
The \`deepseek-harness\` MCP server (v0.2.1-alpha.3) provides architectural assessment, subsystem detection, targeted check recommendations, and execution planning for this workspace.

## WORKFLOW PROTOCOL (MULTI-SESSION OPTIMIZED)
1. **Direct In-Session Execution (Default Path)**:
   - For regular tasks, edits, bugfixes, tests, and queries, execute **directly in the current session** using workspace tools (\`view_file\`, \`replace_file_content\`, \`write_to_file\`, \`run_command\`, etc.).
   - Follow DeepSeek Harness engineering discipline (Cordis service architecture, strict TypeScript without \`as unknown\`, capability seams, targeted Vitest checks).
   - **DO NOT** create or spawn subagents (\`define_subagent\` / \`invoke_subagent\`) for normal tasks. Running subagents concurrently across multiple sessions causes API rate limiting, queue congestion, and progress stalls.

2. **Optional Architectural Guidance**:
   - Call \`run_harness_task\` with \`{ "task": "...", "scope": "..." }\` to obtain architectural classification, affected package groups, and targeted verification commands.
   - By default (\`mode: "auto"\`), it returns compact Direct Execution directives without redundant subagent JSON payloads.

3. **Selective SubAgent Delegation (On-Demand Only)**:
   - Only delegate to a subagent when explicitly requested by the user (e.g. "dùng subagent", "chạy nền", "spawn subagent") or by passing \`mode: "subagent"\`.
`;

  for (const schemaDir of schemaDirs) {
    if (!fs.existsSync(schemaDir)) {
      fs.mkdirSync(schemaDir, { recursive: true });
    }
    const schemaFile = path.join(schemaDir, 'run_harness_task.json');
    fs.writeFileSync(schemaFile, JSON.stringify(toolSchema, null, 2), 'utf-8');
    console.log(`✅ Deployed tool schema in: ${schemaFile}`);

    const instructionsFile = path.join(schemaDir, 'instructions.md');
    fs.writeFileSync(instructionsFile, instructionsContent, 'utf-8');
    console.log(`✅ Deployed instructions in: ${instructionsFile}`);
  }

  console.log('\n🎉 Successfully configured deepseek-harness MCP across Antigravity!');
  console.log(`🚀 Binary path: ${binPath}\n`);
} catch (err) {
  console.error('❌ Failed to configure MCP server:', err);
  process.exit(1);
}
