#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./components/App.js";
import { DEFAULT_CONFIG } from "./core/types.js";
import type { Config } from "./core/types.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Load config from ~/.config/pr-pilot/config.json if it exists
function loadConfig(): Config {
  const configPath = join(homedir(), ".config", "pr-pilot", "config.json");

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, "utf-8");
      const userConfig = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...userConfig };
    } catch {
      // Fall through to defaults
    }
  }

  return DEFAULT_CONFIG;
}

// Parse --repo flag from argv
function parseArgs(): { repo?: string } {
  const args = process.argv.slice(2);
  const repoIdx = args.indexOf("--repo");
  if (repoIdx !== -1 && args[repoIdx + 1]) {
    return { repo: args[repoIdx + 1] };
  }
  // Also support positional: pr-pilot owner/repo
  if (args[0] && args[0].includes("/") && !args[0].startsWith("-")) {
    return { repo: args[0] };
  }
  return {};
}

const config = loadConfig();
const cliArgs = parseArgs();
if (cliArgs.repo) config.repo = cliArgs.repo;

render(React.createElement(App, { config }));
