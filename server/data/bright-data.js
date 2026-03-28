/**
 * Bright Data API client.
 * Fetches real-world data via Bright Data Web Scraper (LinkedIn dataset).
 * Uses async trigger + poll pattern for non-blocking operation.
 * API key is read from environment — never hardcoded.
 */

const { transformEvent, getRandomFallbackEvent } = require("./event-transformer");

const BRIGHTDATA_API_BASE = "https://api.brightdata.com/datasets/v3";
const DATASET_ID = "gd_l1viktl72bvl7bjuj0"; // LinkedIn People scraper
const POLL_TIMEOUT_MS = 10000;

// --- DEBUG COUNTERS ---
let totalBrightDataCalls = 0;
let totalBrightDataSuccesses = 0;
let totalBrightDataFailures = 0;
let lastBrightDataCallTime = null;
let lastBrightDataError = null;
let totalTriggers = 0;
let totalPolls = 0;

function getBrightDataStats() {
  return {
    totalBrightDataCalls,
    totalBrightDataSuccesses,
    totalBrightDataFailures,
    lastBrightDataCallTime,
    lastBrightDataError,
    hasBrightDataKey: !!process.env.BRIGHTDATA_API_KEY,
    totalTriggers,
    totalPolls,
    pendingSnapshot: pendingSnapshot,
    cachedEventsCount: cachedEvents.length,
  };
}

// Log key status on module load
console.log(`🌐 BRIGHT DATA KEY: ${process.env.BRIGHTDATA_API_KEY ? "FOUND" : "MISSING"}`);
if (!process.env.BRIGHTDATA_API_KEY) {
  console.error("❌ Bright Data API key missing — real-world events will use fallback");
}

// LinkedIn profiles of European political/diplomatic/media figures
// These feed real-world data into the geopolitical simulation
const LINKEDIN_URLS = [
  "https://www.linkedin.com/in/uraboron",
  "https://www.linkedin.com/in/charles-michel-523057172",
  "https://www.linkedin.com/in/thierry-breton",
  "https://www.linkedin.com/in/jaborrell",
  "https://www.linkedin.com/in/kaborov",
  "https://www.linkedin.com/in/lukas-mandl",
  "https://www.linkedin.com/in/sebastiankurz",
  "https://www.linkedin.com/in/margrethevestager",
  "https://www.linkedin.com/in/nathalie-loiseau",
  "https://www.linkedin.com/in/radeksikorski",
];
let urlIndex = 0;

// --- Async state ---
let pendingSnapshot = null;
let cachedEvents = [];
let lastTriggerTime = 0;
const MIN_TRIGGER_INTERVAL_MS = 30000; // Don't trigger more than once per 30s

/**
 * Trigger a new LinkedIn scrape (non-blocking).
 * Returns the snapshot_id for later polling.
 */
async function triggerScrape() {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) return null;

  const url = LINKEDIN_URLS[urlIndex % LINKEDIN_URLS.length];
  urlIndex++;
  totalTriggers++;

  console.log(`📡 BRIGHT DATA TRIGGER #${totalTriggers} | url="${url}"`);

  try {
    const response = await fetch(
      `${BRIGHTDATA_API_BASE}/trigger?dataset_id=${DATASET_ID}&type=url_collection`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify([{ url }]),
      }
    );

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      console.error(`❌ BRIGHT DATA TRIGGER FAILED: HTTP ${response.status} ${err.substring(0, 200)}`);
      return null;
    }

    const data = await response.json();
    if (data.snapshot_id) {
      console.log(`✅ BRIGHT DATA TRIGGER SUCCESS | snapshot_id=${data.snapshot_id}`);
      return data.snapshot_id;
    }

    console.warn(`⚠️ BRIGHT DATA TRIGGER: no snapshot_id in response`);
    return null;
  } catch (err) {
    console.error(`❌ BRIGHT DATA TRIGGER ERROR: ${err.message}`);
    return null;
  }
}

/**
 * Poll a pending snapshot for results.
 * Returns array of profile data or null if not ready.
 */
async function pollSnapshot(snapshotId) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey || !snapshotId) return null;

  totalPolls++;
  console.log(`📡 BRIGHT DATA POLL #${totalPolls} | snapshot=${snapshotId}`);

  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);

    const response = await fetch(
      `${BRIGHTDATA_API_BASE}/snapshot/${snapshotId}?format=json`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      }
    );
    clearTimeout(tid);

    if (response.status === 202) {
      console.log(`⏳ BRIGHT DATA POLL: snapshot still processing`);
      return null; // Not ready yet
    }

    if (!response.ok) {
      console.warn(`⚠️ BRIGHT DATA POLL: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`✅ BRIGHT DATA POLL SUCCESS | items=${Array.isArray(data) ? data.length : 0}`);
    console.log(`🌍 BRIGHT DATA POLL DATA:`, JSON.stringify(data).substring(0, 800));
    return Array.isArray(data) ? data : null;
  } catch (err) {
    const reason = err.name === "AbortError" ? "timeout" : err.message;
    console.warn(`⚠️ BRIGHT DATA POLL: ${reason}`);
    return null;
  }
}

/**
 * Transform LinkedIn profile data into a geopolitical world event.
 */
function transformLinkedInToEvent(profiles) {
  if (!profiles || profiles.length === 0) return null;

  for (const profile of profiles) {
    // Skip empty profiles (just input echoed back or no data)
    if (!profile.name && !profile.headline && !profile.about) {
      console.log(`⚠️ SKIPPING EMPTY PROFILE:`, JSON.stringify(profile).substring(0, 200));
      continue;
    }

    const name = profile.name || "European official";
    const headline = profile.headline || profile.about || "";
    const city = profile.city || "";
    const company = profile.current_company?.name || "";

    // Build a geopolitical event from the profile
    let summary;
    if (headline) {
      summary = `${name} (${company || city || "EU"}) signals shift in European policy: "${sanitizeEventText(headline).substring(0, 120)}"`;
    } else {
      summary = `European diplomatic figure ${name} from ${city || "EU"} active in regional affairs`;
    }

    // Determine relevant nations from profile data
    const text = `${name} ${headline} ${city} ${company} ${profile.about || ""}`.toLowerCase();
    const nations = [];
    if (text.match(/france|paris|french|macron/)) nations.push("france");
    if (text.match(/german|berlin|munich|germany/)) nations.push("germany");
    if (text.match(/uk|london|british|britain|england/)) nations.push("uk");
    if (text.match(/russia|moscow|russian|kremlin/)) nations.push("russia");
    if (text.match(/poland|warsaw|polish/)) nations.push("poland");
    if (text.match(/italy|rome|milan|italian/)) nations.push("italy");
    if (nations.length === 0) nations.push("france", "germany"); // Default EU axis

    // Determine category
    let category = "diplomatic";
    if (text.match(/military|defense|nato|army|security/)) category = "military";
    if (text.match(/trade|economic|energy|finance|bank/)) category = "economic";
    if (text.match(/crisis|conflict|war|sanction/)) category = "crisis";

    const event = { summary, category, relevantNations: nations };
    console.log(`🌍 TRANSFORMED LINKEDIN → EVENT:`, JSON.stringify(event));
    return event;
  }

  return null;
}

/**
 * Fetch a real-world event via Bright Data.
 * Uses trigger+poll pattern: triggers scrape, polls for results, falls back if needed.
 *
 * @returns {Promise<{ summary: string, category: string, relevantNations: string[], source: string }>}
 */
async function fetchBrightDataEvent() {
  const apiKey = process.env.BRIGHTDATA_API_KEY;

  console.log(`\n🌍 FETCHING REAL-WORLD EVENT FROM BRIGHT DATA...`);
  console.log(`🌐 BRIGHT DATA KEY: ${apiKey ? `FOUND (${apiKey.substring(0, 8)}...)` : "MISSING"}`);

  totalBrightDataCalls++;
  lastBrightDataCallTime = new Date().toISOString();

  if (!apiKey) {
    console.error("❌ Bright Data API key missing — USING FALLBACK");
    totalBrightDataFailures++;
    lastBrightDataError = "NO_API_KEY";
    return { ...getRandomFallbackEvent(), source: "fallback" };
  }

  // Step 1: Poll pending snapshot for results
  if (pendingSnapshot) {
    console.log(`🌍 CHECKING PENDING SNAPSHOT: ${pendingSnapshot}`);
    const profiles = await pollSnapshot(pendingSnapshot);
    if (profiles && profiles.length > 0) {
      const event = transformLinkedInToEvent(profiles);
      if (event) {
        cachedEvents.push(event);
        console.log(`✅ BRIGHT DATA: Cached ${cachedEvents.length} events from snapshot`);
      }
      pendingSnapshot = null; // Done with this snapshot
    }
    // If 202 (still processing), keep the snapshot for next cycle
  }

  // Step 2: Trigger a new scrape if nothing pending and rate limit allows
  if (!pendingSnapshot && (Date.now() - lastTriggerTime) > MIN_TRIGGER_INTERVAL_MS) {
    const snapshotId = await triggerScrape();
    if (snapshotId) {
      pendingSnapshot = snapshotId;
      lastTriggerTime = Date.now();
    }
  }

  // Step 3: Return cached event if available
  if (cachedEvents.length > 0) {
    totalBrightDataSuccesses++;
    const event = cachedEvents.shift();
    console.log(`✅ BRIGHT DATA EVENT (from cache): "${event.summary}"`);
    console.log(`✅ BRIGHT DATA STATS | calls=${totalBrightDataCalls} successes=${totalBrightDataSuccesses} failures=${totalBrightDataFailures}`);
    return { ...event, source: "bright-data" };
  }

  // Step 4: No cached events — use fallback
  totalBrightDataFailures++;
  lastBrightDataError = `NO_CACHED_DATA_AT_${new Date().toISOString()}`;
  console.log(`⚠️ BRIGHT DATA: No cached events — using fallback (scrape pending: ${!!pendingSnapshot})`);
  console.log(`📊 BRIGHT DATA STATS | calls=${totalBrightDataCalls} successes=${totalBrightDataSuccesses} failures=${totalBrightDataFailures} triggers=${totalTriggers} polls=${totalPolls}`);
  return { ...getRandomFallbackEvent(), source: "fallback" };
}

/**
 * Sanitize event text — truncate and strip control characters.
 */
function sanitizeEventText(text) {
  return text
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * Clear the session cache (for reset/new game).
 */
function clearBrightDataCache() {
  pendingSnapshot = null;
  cachedEvents = [];
  urlIndex = 0;
  lastTriggerTime = 0;
}

module.exports = {
  fetchBrightDataEvent,
  clearBrightDataCache,
  getBrightDataStats,
};
