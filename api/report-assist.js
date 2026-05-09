function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 6000);
}

function extractIdeas(text) {
  return cleanText(text)
    .split(/\n|•|- |\* |\d+\.\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function collectResponseText(data) {
  const parts = [];
  const output = Array.isArray(data.output) ? data.output : [];
  output.forEach((item) => {
    const content = Array.isArray(item.content) ? item.content : [];
    content.forEach((part) => {
      if (part && typeof part.text === "string") parts.push(part.text);
    });
  });
  return parts.join("\n").trim();
}

function parseSuggestionsJson(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch (err) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw err;
    return JSON.parse(match[0]);
  }
}

function normalizeSuggestions(result) {
  const suggestions = Array.isArray(result && result.suggestions) ? result.suggestions : [];
  return suggestions.slice(0, 3).map((item, index) => ({
    id: cleanText(item.id || `option-${index + 1}`),
    label: cleanText(item.label || `Option ${index + 1}`),
    angle: cleanText(item.angle || ""),
    text: cleanText(item.text || ""),
  })).filter((item) => item.text);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not set in Vercel." });
    return;
  }

  try {
    const body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    const section = cleanText(body.section || "Report section");
    const reportTitle = cleanText(body.title || "Report");
    const ideas = extractIdeas(body.ideas || body.text || "");

    if (!ideas.length) {
      res.status(400).json({ error: "Add bullet points before asking for report suggestions." });
      return;
    }

    const prompt = {
      task: "Turn the user's bullet points into three different report-ready paragraph options.",
      reportTitle,
      currentSection: section,
      userBulletPoints: ideas,
      requiredOutput: [
        "Return only valid JSON.",
        "Use exactly this shape: {\"suggestions\":[{\"id\":\"formal\",\"label\":\"Formal Paragraph\",\"angle\":\"Polished report wording\",\"text\":\"...\"},{\"id\":\"summary\",\"label\":\"Short Summary\",\"angle\":\"Short and direct\",\"text\":\"...\"},{\"id\":\"action\",\"label\":\"Action / Next Steps\",\"angle\":\"What to do or recommend next\",\"text\":\"...\"}]}",
        "Each text value must be one paragraph only.",
        "Do not invent measurements, dates, names, results, or facts not present in the bullet points.",
        "Preserve the user's meaning and make the wording easier to use in a report.",
      ],
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        instructions:
          "You are an assistive report-writing helper for people who type slowly or use accessible input. Convert rough bullet points into clear report text. Keep the user's meaning, do not add unsupported facts, and return only valid JSON.",
        input: JSON.stringify(prompt),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error && data.error.message ? data.error.message : `OpenAI API request failed (${response.status})`;
      res.status(500).json({ error: message });
      return;
    }

    const text = data.output_text || collectResponseText(data);
    const suggestions = normalizeSuggestions(parseSuggestionsJson(text));
    res.status(200).json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: err.message || "Could not generate report suggestions" });
  }
};
