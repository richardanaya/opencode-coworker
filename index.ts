import type { Plugin, ToolContext } from "@opencode-ai/plugin";
import type { createOpencodeClient } from "@opencode-ai/sdk";
import * as fs from "fs";
import * as path from "path";

// =============================================================================
// Types
// =============================================================================

interface Coworker {
  sessionId: string;
  agentType: string;
  createdAt: string;
  parentId?: string;
}

interface CoworkerStorage {
  [name: string]: Coworker;
}

type SessionClient = ReturnType<typeof createOpencodeClient>;

// Config type for the config hook (server config with experimental fields)
interface ServerConfig {
  experimental?: {
    primary_tools?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// =============================================================================
// Storage
// =============================================================================

let storageFile: string | null = null;

async function getStorageFile(client: SessionClient): Promise<string> {
  if (!storageFile) {
    const result = await client.path.get();
    storageFile = path.join(result.data!.config, "coworkers.json");
  }
  return storageFile;
}

async function loadCoworkers(client: SessionClient): Promise<CoworkerStorage> {
  const file = await getStorageFile(client);
  try {
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, "utf-8")) as CoworkerStorage;
      // Normalize all names to lowercase for case-insensitive lookup
      const normalized: CoworkerStorage = {};
      for (const [name, coworker] of Object.entries(data)) {
        normalized[name.toLowerCase()] = coworker;
      }
      return normalized;
    }
  } catch {}
  return {};
}

async function saveCoworkers(client: SessionClient, coworkers: CoworkerStorage) {
  const file = await getStorageFile(client);
  fs.writeFileSync(file, JSON.stringify(coworkers, null, 2));
}

// =============================================================================
// State Tracking (in-memory only)
// =============================================================================

const activeSessions = new Map<string, string>(); // sessionId -> name
const sessionParents = new Map<string, string>(); // sessionId -> parentId

// =============================================================================
// Plugin Definition
// =============================================================================

const coworkerPlugin: Plugin = async (ctx) => {
  const client = ctx.client;
  const directory = ctx.directory;

  // Get the tool helper and zod schema from the plugin
  const { tool } = await import("@opencode-ai/plugin");
  const z = tool.schema;

  // Create tools with access to client via closure
  const createCoworkerTool = tool({
    description: "Create a new coworker session with a specific agent type and name",
    args: {
      name: z.string().describe("User-friendly name for this coworker"),
      agent_type: z.string().optional().describe("Agent type to use (e.g., code, researcher). Defaults to 'code'"),
      prompt: z.string().describe("Initial prompt/task for the coworker"),
    },
    async execute(args, toolCtx) {
      const coworkers = await loadCoworkers(client);
      const name = args.name.toLowerCase();

      if (coworkers[name]) {
        return `Error: Coworker "${name}" already exists with session ${coworkers[name].sessionId}`;
      }

      const result = await client.session.create({
        body: {
          parentID: toolCtx.sessionID,
          title: `${args.name} (${args.agent_type ?? "code"})`,
        },
      });

      const sessionId = result.data?.id;
      if (!sessionId) {
        return "Error: Failed to create session";
      }

      await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: args.prompt }],
          agent: args.agent_type ?? "code",
        },
      });

      coworkers[name] = {
        sessionId,
        agentType: args.agent_type ?? "code",
        createdAt: new Date().toISOString(),
        parentId: toolCtx.sessionID,
      };
      await saveCoworkers(client, coworkers);

      activeSessions.set(sessionId, name);
      sessionParents.set(sessionId, toolCtx.sessionID);

      return `Created coworker "${name}" (${args.agent_type ?? "code"}) with session ${sessionId}`;
    },
  });

  const listCoworkersTool = tool({
    description: "List all coworkers and their session IDs",
    args: {},
    async execute() {
      const coworkers = await loadCoworkers(client);
      const entries = Object.entries(coworkers);

      if (entries.length === 0) {
        return "No coworkers found";
      }

      return entries
        .map(([name, info]) => {
          const status = activeSessions.has(info.sessionId) ? "active" : "idle";
          return `${name} (${info.agentType}) → ${info.sessionId} [${status}]`;
        })
        .join("\n");
    },
  });

  const tellCoworkerTool = tool({
    description: "Queue a message to a coworker session to wake them up or give them work",
    args: {
      name: z.string().describe("Name of the coworker to message"),
      message: z.string().describe("Message or task to send to the coworker"),
    },
    async execute(args) {
      const coworkers = await loadCoworkers(client);
      const name = args.name.toLowerCase();
      const coworker = coworkers[name];

      if (!coworker) {
        return `Error: Coworker "${name}" not found. Use list_coworkers to see available coworkers.`;
      }

      await client.session.prompt({
        path: { id: coworker.sessionId },
        body: {
          parts: [{ type: "text", text: args.message }],
        },
      });

      return `Queued message to "${name}" (${coworker.agentType})`;
    },
  });

  return {
    // Register tools
    tool: {
      create_coworker: createCoworkerTool,
      list_coworkers: listCoworkersTool,
      tell_coworker: tellCoworkerTool,
    },

    // Register /coworkers command
    command: {
      coworkers: {
        description: "List all coworkers",
        template: "",
        execute: async () => {
          const coworkers = await loadCoworkers(client);
          const entries = Object.entries(coworkers);

          if (entries.length === 0) {
            return { text: "No coworkers found" };
          }

          const list = entries
            .map(([name, info]) => {
              const status = activeSessions.has(info.sessionId)
                ? "active"
                : "idle";
              return `• ${name} (${info.agentType}) → ${info.sessionId} [${status}]`;
            })
            .join("\n");

          return { text: `**Coworkers:**\n${list}` };
        },
      },
    },

    // Hook: Add tools to primary_tools config (changed from subagent_tools)
    config: async (input: ServerConfig) => {
      input.experimental ??= {};
      input.experimental.primary_tools ??= [];
      input.experimental.primary_tools.push("create_coworker", "list_coworkers", "tell_coworker");
    },
  };
};

export default coworkerPlugin;
