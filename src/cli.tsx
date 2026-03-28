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

const config = loadConfig();
render(React.createElement(App, { config }));
