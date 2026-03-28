const FEATHERLESS_BASE_URL = "https://api.featherless.ai/v1/chat/completions";
const MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct";
const MAX_RETRIES = 2;
const TIMEOUT_MS = 15000;

// --- DEBUG COUNTERS (exported for /api/state) ---
let totalApiCalls = 0;
let totalApiSuccesses = 0;
let totalApiFailures = 0;
let lastApiCallTime = null;
let lastApiError = null;

function getApiStats() {
  return { totalApiCalls, totalApiSuccesses, totalApiFailures, lastApiCallTime, lastApiError, hasApiKey: !!process.env.FEATHERLESS_API_KEY };
}

/**
 * Call the Featherless AI API with retry logic.
 * API key is read from environment — never hardcoded.
 *
 * @param {string} systemPrompt - System-level instruction
 * @param {string} userPrompt - User-level context + question
 * @returns {Promise<string|null>} Raw AI response text, or null on failure
 */
async function callFeatherless(systemPrompt, userPrompt) {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  console.log(`\n🔑 [Featherless] API KEY STATUS: ${apiKey ? `FOUND (${apiKey.substring(0, 8)}...${apiKey.slice(-4)})` : "❌ MISSING"}`);
  if (!apiKey) {
    console.error("❌ [Featherless] AI DISABLED — NO API KEY. All decisions will use FALLBACK.");
    totalApiFailures++;
    lastApiError = "NO_API_KEY";
    return null;
  }
  totalApiCalls++;
  lastApiCallTime = new Date().toISOString();
  console.log(`🧠 [Featherless] API CALL #${totalApiCalls} START | model=${MODEL} | prompt_len=${userPrompt.length}`);
  console.log(`🧠 [Featherless] PROMPT PREVIEW: ${userPrompt.substring(0, 200)}...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(FEATHERLESS_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const statusText = response.statusText || "Unknown error";
        console.error(`[Featherless] HTTP ${response.status}: ${statusText} (attempt ${attempt}/${MAX_RETRIES})`);
        continue;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        console.error(`🧠 [Featherless] EMPTY RESPONSE (attempt ${attempt}/${MAX_RETRIES})`);
        console.log(`🧠 [Featherless] RAW API DATA:`, JSON.stringify(data).substring(0, 500));
        continue;
      }

      totalApiSuccesses++;
      console.log(`🧠 [Featherless] RAW AI RESPONSE (attempt ${attempt}):`, content.trim().substring(0, 300));
      console.log(`🧠 [Featherless] API CALL SUCCESS | total_calls=${totalApiCalls} | successes=${totalApiSuccesses} | failures=${totalApiFailures}`);
      return content.trim();
    } catch (err) {
      const reason = err.name === "AbortError" ? "timeout" : err.message;
      console.error(`[Featherless] Request failed: ${reason} (attempt ${attempt}/${MAX_RETRIES})`);
    }
  }

  totalApiFailures++;
  lastApiError = `ALL_RETRIES_EXHAUSTED_AT_${new Date().toISOString()}`;
  console.error(`❌ [Featherless] ALL RETRIES EXHAUSTED — returning null | total_failures=${totalApiFailures}`);
  return null;
}

module.exports = { callFeatherless, getApiStats };
