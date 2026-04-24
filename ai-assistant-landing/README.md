# AI Assistant Landing Website (Standalone)

This is a separate website in its own folder, independent from the existing assistant app.

## Features

- Landing page presenting the AI assistant vision for consulting businesses.
- Product goal documented in `PROJECT_GOAL.md`.
- Runtime Notion sync via `@notionhq/client`.
- Displays database rows using these properties:
  - `Status`
  - `Changes`
  - `Time`
  - `Version`

## Setup

1. Go to this folder:
   - `cd ai-assistant-landing`
2. Install dependencies:
   - `npm install`
3. Create `.env` from `.env.example` and set:
   - `NOTION_TOKEN`
   - `NOTION_DATABASE_ID`
4. Share the Notion database with your integration in Notion.
5. Run:
   - `npm run dev`
6. Open:
   - `http://localhost:3000`

## API

- `GET /api/updates` queries Notion and returns:

```json
{
  "items": [
    {
      "status": "Done",
      "changes": "Improved docs module",
      "time": "2026-04-24",
      "version": "v1.2.0"
    }
  ]
}
```
