import fetch from "node-fetch";

const OLLAMA_URL = "http://localhost:11434/api/generate";

export async function callLocalBrain(prompt: string) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "deepseek-v3.1:671b-cloud", // adjust if needed
      prompt,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error("Local brain unavailable");
  }

  const data: any = await response.json();
  return data.response;
}