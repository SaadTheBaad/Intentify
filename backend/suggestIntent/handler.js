const OPENAI_KEY = process.env.OPENAI_API_KEY;
const GPT_MODEL = process.env.OPENAI_GPT_MODEL;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT;
const USER_PROMPT_TEMPLATE = process.env.USER_PROMPT_TEMPLATE;

exports.handler = async (event) => {
  try {
    const body = safeJson(event.body);
    if (!body) return resp(400, { error: "Invalid JSON body" });

    const { transcript } = body;
    if (!transcript) {
      return resp(400, { error: "transcript required" });
    }

    if (!OPENAI_KEY) return resp(500, { error: "Missing OPENAI_API_KEY" });
    if (!SYSTEM_PROMPT) return resp(500, { error: "Missing SYSTEM_PROMPT" });
    if (!USER_PROMPT_TEMPLATE) return resp(500, { error: "Missing USER_PROMPT_TEMPLATE" });

    // Call OpenAI to generate intent suggestions
    const suggestion = await generateIntentSuggestion(transcript);

    return resp(200, { 
      ok: true, 
      suggestion: {
        label: suggestion,
        confidence: "ai-generated"
      }
    });
  } catch (err) {
    console.error("Suggest intent error:", err);
    return resp(500, { error: "Server error" });
  }
};

async function generateIntentSuggestion(transcript) {
  const userPrompt = USER_PROMPT_TEMPLATE.replace("{transcript}", transcript);

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: GPT_MODEL,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 100,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    console.error("OpenAI chat completion failed:", r.status, t);
    throw new Error(`chat completion failed: ${r.status}`);
  }

  const json = await r.json();
  const suggestion = json?.choices?.[0]?.message?.content?.trim();
  
  if (!suggestion) {
    throw new Error("No suggestion returned from OpenAI");
  }

  return suggestion;
}

function resp(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,DELETE",
  };
}

function safeJson(str) {
  try {
    return JSON.parse(str || "{}");
  } catch {
    return null;
  }
}
