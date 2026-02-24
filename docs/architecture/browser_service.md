# Knowledge Item: Browser Service API (Playwright)

## Overview

The Browser Service provides a dedicated headless browser environment for agents to perform web research, UI verification, and data scraping. It runs on `http://localhost:14200` by default.

## API Endpoints

### 1. Navigation

- **Endpoint:** `POST /v1/browser/navigate`
- **Payload:** `{ "url": "https://example.com" }`
- **Response:** `{ "success": true, "url": "actual_url" }`

### 2. Content Extraction

- **Endpoint:** `GET /v1/browser/content`
- **Response:**

  ```json
  {
    "url": "https://example.com",
    "content": "<html>...</html>",
    "text": "Extracted body text..."
  }
  ```

### 3. Visual Verification

- **Endpoint:** `POST /v1/browser/screenshot`
- **Response:** A raw PNG image buffer.
- **Tip:** Use this to verify that UI components rendered correctly during an autonomous task.

### 4. Interaction (Click/Type)

- **POST `/v1/browser/click`**: `{ "selector": "button#submit" }`
- **POST `/v1/browser/type`**: `{ "selector": "input#search", "text": "hello world" }`

## Usage Pattern for Agents

Agents should use `curl` to interact with this service during an `@auto` task.
Example:

```bash
curl -X POST http://localhost:14200/v1/browser/navigate -H "Content-Type: application/json" -d '{"url": "https://docs.microsoft.com"}'
curl http://localhost:14200/v1/browser/content > D:/tmp/docs_content.json
```
