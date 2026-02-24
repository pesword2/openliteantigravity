# Knowledge Item: Autonomous Cascading Engine

## Overview

Open-Antigravity features a recursive task execution model where agents can autonomously spawn child tasks to parallelize or delegate work. This is achieved through the **Inter-Agent Communication Bus**.

## Core Mechanisms

### 1. Autonomous Command Extraction

The Orchestrator can be instructed to run in `isAutonomous` mode (triggered by the `@auto` prompt prefix or an explicit flag).

- **Text Parsing:** The engine uses `extractCommandsFromText` to find ` ```bash ` or ` ```powershell ` blocks.
- **Filtering:** It automatically ignores non-executable blocks like `json`, `yaml`, or `markdown`.
- **System Adaptation:** On Windows, commands are wrapped in a **PowerShell** shell to ensure redirection (`>`) and complex system calls work as agents expect.

### 2. Recursive Task Spawning

Agents can spawn child tasks by executing `curl` commands against the local Orchestrator API (`http://localhost:14100/v1/tasks`).

- **Parent-Child Linking:** The `parentTaskId` property links these tasks, allowing for hierarchical visualization in the Manager UI.
- **Blocking Wait:** Agents can use the `GET /v1/tasks/:id/wait` endpoint to pause their own execution until a child completes, enabling synchronous workflows.

### 3. Implementation Patterns

- **Director Pattern:** The top-level agent breaks a vision into high-level specs.
- **Lead Engineer Pattern:** Takes a spec and spawns specialized sub-tasks for Developers.
- **Developer Pattern:** Executes the leaf nodes of the task tree (writing code, fixing bugs).

## Native Execution Stack

- **Process Manager:** PM2 handles the Orchestrator, Web, and Browser services.
- **Environment:** Native Node.js on Windows/Linux using `.env` files for model configuration.
- **Browser Service:** A dedicated Playwright-based REST API for headless navigation and scraping.
