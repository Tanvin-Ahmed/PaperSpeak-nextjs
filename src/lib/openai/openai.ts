import OpenAI from "openai";

export const openAI = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});
