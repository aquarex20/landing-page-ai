require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const { Client } = require("@notionhq/client");

const notionToken = process.env.NOTION_TOKEN;
const notionDatabaseId = process.env.NOTION_DATABASE_ID;
const outputPath = path.join(__dirname, "..", "public", "updates.json");

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

async function syncNotionToJson() {
  if (!notionToken || !notionDatabaseId) {
    throw new Error("Missing NOTION_TOKEN or NOTION_DATABASE_ID.");
  }

  const notion = new Client({ auth: notionToken });
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

  const payload = {
    generatedAt: new Date().toISOString(),
    items
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${items.length} items to ${outputPath}`);
}

syncNotionToJson().catch((error) => {
  console.error(`Notion sync failed: ${error.message}`);
  process.exit(1);
});
