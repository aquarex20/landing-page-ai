require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const { Client, APIResponseError } = require("@notionhq/client");

const notionToken = (process.env.NOTION_TOKEN || "").trim();
const rawDatabaseId = (process.env.NOTION_DATABASE_ID || "").trim();
const outputPath = path.join(__dirname, "..", "public", "updates.json");
const failOnEmpty = String(process.env.NOTION_FAIL_ON_EMPTY || "").toLowerCase() === "true";

/** Notion URLs and copy-paste often include hyphens or extra bits; API wants the UUID. */
function normalizeNotionDatabaseId(value) {
  if (!value) return "";
  let s = value.trim();
  const fromUrl = s.match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})/i);
  if (fromUrl) s = fromUrl[1];
  const hex = s.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-f]+$/i.test(hex)) return "";
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function findProperty(properties, canonicalName) {
  if (!properties || typeof properties !== "object") return undefined;
  const keys = Object.keys(properties);
  const direct = keys.find((k) => k === canonicalName);
  if (direct) return properties[direct];
  const lower = canonicalName.toLowerCase();
  const match = keys.find((k) => k.toLowerCase() === lower);
  return match ? properties[match] : undefined;
}

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

function rowHasAnyContent(row) {
  return Boolean(row.status || row.changes || row.time || row.version);
}

async function appendStepSummary(line) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  await fs.appendFile(summaryPath, `${line}\n`, "utf8");
}

async function syncNotionToJson() {
  const dbId = normalizeNotionDatabaseId(rawDatabaseId);
  if (!notionToken) {
    throw new Error("Missing NOTION_TOKEN (set it in GitHub Actions secrets or .env locally).");
  }
  if (!rawDatabaseId) {
    throw new Error("Missing NOTION_DATABASE_ID.");
  }
  if (!dbId) {
    throw new Error(
      `NOTION_DATABASE_ID is not a valid UUID (got "${rawDatabaseId.slice(0, 24)}…"). Use the database ID from Notion (32 hex chars), not a page URL slug alone.`
    );
  }

  const notion = new Client({ auth: notionToken });
  const allPages = [];
  let cursor = undefined;

  try {
    do {
      const result = await notion.databases.query({
        database_id: dbId,
        page_size: 100,
        start_cursor: cursor
      });
      allPages.push(...result.results);
      cursor = result.has_more ? result.next_cursor : undefined;
    } while (cursor);
  } catch (err) {
    if (APIResponseError.isAPIResponseError(err)) {
      const hint =
        err.code === "object_not_found"
          ? " Not found: wrong ID, or the integration is not invited to this database in Notion."
          : err.code === "validation_error"
            ? " Validation error: NOTION_DATABASE_ID must be a database, not a normal page (unless that page is the database root)."
            : "";
      throw new Error(`Notion API ${err.status} (${err.code}): ${err.message}.${hint}`);
    }
    throw err;
  }

  if (allPages.length === 0) {
    await appendStepSummary("## Notion sync");
    await appendStepSummary("**Result:** 0 rows returned — `public/updates.json` was not modified (no commit).");
    console.log("Notion returned 0 database rows; leaving updates.json unchanged.");
    if (failOnEmpty) {
      throw new Error("NOTION_FAIL_ON_EMPTY=true but database has no rows.");
    }
    return;
  }

  const firstProps = allPages[0].properties || {};
  const propKeys = Object.keys(firstProps);
  await appendStepSummary("## Notion sync");
  await appendStepSummary(`**Rows fetched:** ${allPages.length}`);
  await appendStepSummary(`**Property names on first row:** ${propKeys.length ? propKeys.map((k) => `\`${k}\``).join(", ") : "(none)"}`);

  const items = allPages.map((page) => {
    const props = page.properties || {};
    return {
      status: propToText(findProperty(props, "Status")),
      changes: propToText(findProperty(props, "Changes")),
      time: propToText(findProperty(props, "Time")),
      version: propToText(findProperty(props, "Version"))
    };
  });

  items.sort((a, b) => (b.time || "").localeCompare(a.time || ""));

  const meaningful = items.filter(rowHasAnyContent);
  if (meaningful.length === 0) {
    const msg = [
      "Notion returned pages but every mapped field is empty.",
      `Expected properties like Status, Changes, Time, Version (case-insensitive).`,
      `First row has: ${propKeys.join(", ") || "(no properties)"}.`
    ].join(" ");
    await appendStepSummary(`**Error:** ${msg}`);
    throw new Error(msg);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    items: meaningful
  };

  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${meaningful.length} non-empty row(s) to ${outputPath}`);
  await appendStepSummary(`**Wrote:** \`${meaningful.length}\` row(s) to \`public/updates.json\`.`);
}

syncNotionToJson().catch((error) => {
  console.error(`Notion sync failed: ${error.message}`);
  process.exit(1);
});
