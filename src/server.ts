import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
let skill = "", patterns = "", templates = "";

async function loadKnowledge() {
  [skill, patterns, templates] = await Promise.all([
    fs.readFile(path.join(ROOT, "SKILL.md"), "utf8"),
    fs.readFile(path.join(ROOT, "patterns.md"), "utf8"),
    fs.readFile(path.join(ROOT, "templates.md"), "utf8")
  ]);
}

const profiles: Record<string, { keywords: string[]; template: string; section: string }> = {
  "Cursor / Windsurf": { keywords: ["cursor", "windsurf"], template: "G — File-Scope", section: "Cursor / Windsurf" },
  "GitHub Copilot": { keywords: ["copilot"], template: "G — File-Scope", section: "GitHub Copilot" },
  "Claude Code": { keywords: ["claude code"], template: "H — ReAct + Stop Conditions", section: "Claude Code" },
  "Devin": { keywords: ["devin"], template: "H — ReAct + Stop Conditions", section: "Devin / SWE-agent" },
  "Midjourney": { keywords: ["midjourney"], template: "I — Visual Descriptor", section: "Midjourney" },
  "DALL-E": { keywords: ["dall-e", "dalle", "dall e"], template: "I — Visual Descriptor", section: "DALL-E 3" },
  "Stable Diffusion": { keywords: ["stable diffusion", "sdxl", "sd 1.5"], template: "I — Visual Descriptor", section: "Stable Diffusion" },
  "ComfyUI": { keywords: ["comfyui", "comfy ui"], template: "K — ComfyUI", section: "ComfyUI" },
  "Sora / Runway": { keywords: ["sora", "runway"], template: "I — Visual Descriptor", section: "Sora / Runway" },
  "Lovable": { keywords: ["lovable"], template: "C — RISEN", section: "Bolt / v0 / Lovable" },
  "v0": { keywords: ["v0"], template: "C — RISEN", section: "Bolt / v0 / Lovable" },
  "Bolt": { keywords: ["bolt.new", "bolt"], template: "C — RISEN", section: "Bolt / v0 / Lovable" },
  "Gemini": { keywords: ["gemini"], template: "A — RTF", section: "Gemini 2.x / Gemini 3 Pro" },
  "Grok": { keywords: ["grok"], template: "A — RTF", section: "Grok / Grok 4.6 / xAI" },
  "Qwen": { keywords: ["qwen"], template: "A — RTF", section: "Qwen 2.5 (instruct variants)" },
  "Ollama": { keywords: ["ollama"], template: "A — RTF", section: "Ollama (local model deployment)" },
  "DeepSeek": { keywords: ["deepseek"], template: "A — RTF", section: "DeepSeek-R1" },
  "MiniMax": { keywords: ["minimax"], template: "A — RTF", section: "MiniMax (M3 / M2.7)" },
  "ChatGPT / OpenAI": { keywords: ["chatgpt", "gpt-", "openai"], template: "A — RTF", section: "ChatGPT / GPT-5.6 / OpenAI GPT models" },
  "Claude": { keywords: ["claude"], template: "A — RTF", section: "Claude (claude.ai, Claude API, Claude 5 / current Claude models)" },
  "Perplexity": { keywords: ["perplexity"], template: "A — RTF", section: "Research / Orchestration AI" },
  "ElevenLabs": { keywords: ["elevenlabs", "eleven labs"], template: "A — RTF", section: "ElevenLabs" },
  "Zapier / Make / n8n": { keywords: ["zapier", "make.com", "n8n"], template: "C — RISEN", section: "Zapier / Make / n8n" }
};

function detect(input: string) {
  const s = input.toLowerCase();
  for (const [name, p] of Object.entries(profiles)) {
    if (p.keywords.some(k => s.includes(k))) return { name, ...p, confidence: "high" as const };
  }
  return { name: "unknown", template: "A — RTF", section: "", keywords: [], confidence: "low" as const };
}

function section(text: string, heading: string, max = 6500) {
  if (!heading) return "";
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex(x => x.toLowerCase().includes(heading.toLowerCase()));
  if (i < 0) return "";
  let end = Math.min(lines.length, i + 90);
  for (let j = i + 1; j < lines.length; j++) {
    if (/^#{1,3}\s/.test(lines[j])) { end = j; break; }
  }
  return lines.slice(i, end).join("\n").slice(0, max);
}

function template(name: string) {
  return section(templates, `## Template ${name[0]}`) || section(templates, name) || "";
}

function relevantPatterns(input: string) {
  const s = input.toLowerCase(), out: string[] = [];
  const map: Array<[string, string[]]> = [
    ["Task Patterns", ["build", "write", "create", "fix", "improve", "rewrite", "generate"]],
    ["Context Patterns", ["context", "memory", "continue", "project", "previous"]],
    ["Format Patterns", ["format", "json", "table", "summary", "image", "midjourney"]],
    ["Scope Patterns", ["code", "cursor", "windsurf", "copilot", "file", "agent"]],
    ["Reasoning Patterns", ["debug", "analysis", "math", "logic", "reason"]],
    ["Agentic Patterns", ["agent", "autonomous", "claude code", "devin", "terminal"]]
  ];
  for (const [h, words] of map) if (words.some(w => s.includes(w))) out.push(section(patterns, h));
  return out.filter(Boolean).join("\n\n").slice(0, 6500);
}

function core() {
  const a = skill.indexOf("## PRIMACY ZONE"), b = skill.indexOf("## MIDDLE ZONE");
  return skill.slice(a, b > a ? b : a + 6500).slice(0, 6500);
}

function createServer() {
  const server = new McpServer({ name: "promptlikho", version: "1.0.0" });
  server.registerTool("prompt_master", {
    title: "PromptLikho",
    description: "Use this when the user explicitly wants to write, generate, fix, improve, optimize, adapt, decompile, simplify, or split a prompt for a specific AI tool. Do not use for ordinary questions, normal coding help, or document writing unless the user is asking for a prompt to give another AI. Return the PromptLikho guidance needed to produce one production-ready, copyable prompt. If the target AI tool is ambiguous, identify that and ask at most 3 focused questions.",
    inputSchema: {
      request: z.string().min(1).describe("The user's prompt-engineering request."),
      target_tool: z.string().optional().describe("Target AI tool if explicitly supplied."),
      operation: z.enum(["generate", "fix", "improve", "adapt", "decompile", "simplify", "split", "unknown"]).optional()
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true }
  }, async ({ request, target_tool, operation }) => {
    const d = target_tool ? { ...detect(target_tool), name: target_tool, confidence: "high" as const } : detect(request);
    const op = operation ?? (/\b(decompile|break down|analy[sz]e)\b/i.test(request) ? "decompile" : /\b(adapt|convert|translate)\b/i.test(request) ? "adapt" : /\b(simplify|shorten|tighten)\b/i.test(request) ? "simplify" : /\bsplit\b/i.test(request) ? "split" : /\b(fix|repair)\b/i.test(request) ? "fix" : /\b(improve|optimi[sz]e|enhance)\b/i.test(request) ? "improve" : "generate");
    const needs = d.confidence === "low" && !target_tool;
    const guidance = [
      "PROMPTLIKHO — TOOL-ONLY CHATGPT APP",
      "Use the supplied PromptLikho source files as the governing behavior.",
      "\nCORE RULES:\n" + core(),
      `\nOPERATION: ${op}\nTARGET TOOL: ${d.name}\nTARGET CONFIDENCE: ${d.confidence}\nSELECTED TEMPLATE: ${d.template}`,
      d.section ? "\nTARGET-SPECIFIC GUIDANCE:\n" + section(skill, d.section) : "\nTARGET-SPECIFIC GUIDANCE: No known profile. Use the source material's Universal Fingerprint approach.",
      "\nSELECTED TEMPLATE:\n" + template(d.template),
      "\nRELEVANT CREDIT-KILLING PATTERNS:\n" + relevantPatterns(request),
      "\nEXECUTION CONTRACT:\n1. Silently extract task, target tool, output format, constraints, input, context, audience, success criteria, and examples.\n2. Ask no more than 3 clarifying questions, only when critical.\n3. Select the framework silently.\n4. Never request hidden chain-of-thought.\n5. Remove redundant wording.\n6. Produce one clean copyable prompt unless variants were requested.\n7. End with 🎯 Target and one-line 💡 strategy note.",
      needs ? "\nTARGET IS AMBIGUOUS: Ask the user to identify the target AI tool before producing the final prompt." : "\nTarget is sufficiently identified; proceed without needless confirmation.",
      "\nUSER REQUEST:\n" + request
    ].join("\n");
    return {
      content: [{ type: "text", text: guidance }],
      structuredContent: { app: "PromptLikho", operation: op, targetTool: d.name, targetConfidence: d.confidence, selectedTemplate: d.template, needsTargetClarification: needs, guidance }
    };
  });
  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ name: "PromptLikho", status: "ok", version: "1.0.0" }));
app.all("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => transport.close().catch(() => {}));
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed" });
  }
});

const port = Number(process.env.PORT || 3000);
loadKnowledge().then(() => {
  app.listen(port, "0.0.0.0", () => console.log(`PromptLikho MCP server on :${port}/mcp`));
}).catch(error => {
  console.error("Failed to load PromptLikho knowledge files", error);
  process.exit(1);
});
