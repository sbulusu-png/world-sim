const FEATHERLESS_BASE_URL = "https://api.featherless.ai/v1/chat/completions";
const MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct";
const MAX_RETRIES = 2;
const TIMEOUT_MS = 15000;

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
  if (!apiKey) {
    console.error("[Featherless] FEATHERLESS_API_KEY not set — skipping AI call");
    return null;
  }

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
        console.error(`[Featherless] Empty response (attempt ${attempt}/${MAX_RETRIES})`);
        continue;
      }

      return content.trim();
    } catch (err) {
      const reason = err.name === "AbortError" ? "timeout" : err.message;
      console.error(`[Featherless] Request failed: ${reason} (attempt ${attempt}/${MAX_RETRIES})`);
    }
  }

  console.error("[Featherless] All retries exhausted — returning null");
  return null;
}

module.exports = { callFeatherless };
