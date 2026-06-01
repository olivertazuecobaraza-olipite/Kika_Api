import { OpenAI } from 'openai';

export const perplexity = process.env.PERPLEXITY_API_KEY
    ? new OpenAI({
        apiKey: process.env.PERPLEXITY_API_KEY,
        baseURL: 'https://api.perplexity.ai'
    })
    : null;
