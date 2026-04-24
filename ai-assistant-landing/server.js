require("dotenv").config();
const express = require("express");
const path = require("path");
const { Client } = require("@notionhq/client");

const app = express();
const port = process.env.PORT || 3000;

const notionToken = process.env.NOTION_TOKEN;
const notionDatabaseId = process.env.NOTION_DATABASE_ID;
const notion = notionToken ? new Client({ auth: notionToken }) : null;

app.use(express.static(path.join(__dirname, "public")));

function propToText(property) {
  if (!property || !property.type) return "";

  switch (property.type) {
    case "title":
      return property.title.map((item) => item.plain_text || "").join("");
    case "rich_text":
      return property.rich_text.map((item) => item.plain_text || "").join("");
    case "status":
      return property.status?.name || "";
    case "select":
      return property.select?.name || "";
    case "multi_select":
      return property.multi_select.map((item) => item.name || "").join(", ");
    case "date":
      return property.date?.start || "";
    case "number":
      return property.number === null ? "" : String(property.number);
    case "checkbox":
      return property.checkbox ? "Yes" : "No";
    default:
      return "";
  }
}

app.get("/api/updates", async (_req, res) => {
  if (!notion || !notionDatabaseId) {
    return res.status(503).json({
      error: "Missing NOTION_TOKEN or NOTION_DATABASE_ID in environment."
    });
  }

  try {
    const result = await notion.databases.query({
      database_id: notionDatabaseId,
      page_size: 50
    });

    const items = result.results.map((page) => {
      const props = page.properties || {};
      return {
        status: propToText(props.Status),
        changes: propToText(props.Changes),
        time: propToText(props.Time),
        version: propToText(props.Version)
      };
    });

    items.sort((a, b) => (b.time || "").localeCompare(a.time || ""));
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({
      error: `Failed to fetch Notion data: ${error.message}`
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Landing site running on http://localhost:${port}`);
});
