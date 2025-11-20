import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
    dangerouslyAllowBrowser: true // Note: In production, keep this server-side only
});

export interface AnalyzedTransaction {
    original: any;
    category: string;
    confidence: number;
    needsReview: boolean;
    question?: string;
    reasoning?: string;
}

import { loadRules, findMatchingRule } from './rules';

export const analyzeTransactions = async (transactions: any[]): Promise<AnalyzedTransaction[]> => {
    // Load existing rules
    const rules = loadRules();
    const analyzedTransactions: AnalyzedTransaction[] = [];
    const transactionsForAi: any[] = [];

    // First pass: Apply rules
    for (const t of transactions) {
        const rule = findMatchingRule(t.description, rules);
        if (rule) {
            analyzedTransactions.push({
                original: t,
                category: rule.category,
                confidence: 1.0,
                needsReview: false,
                reasoning: `Matched rule: "${rule.pattern}"`
            });
        } else {
            transactionsForAi.push(t);
        }
    }

    // If all matched rules, return early
    if (transactionsForAi.length === 0) {
        return analyzedTransactions;
    }

    // In a real app, we would batch these or send a summary if too many
    const prompt = `
    You are an expert bookkeeper. Analyze the following bank transactions and categorize them into standard Xero account codes (e.g., 'Office Expenses', 'Travel', 'Sales', 'Bank Fees').
    
    For each transaction:
    1. Assign a category.
    2. Assign a confidence score (0-1).
    3. If confidence is below 0.8, set needsReview to true and formulate a specific question to ask the user to clarify.
    
    Transactions:
    ${JSON.stringify(transactionsForAi)} // Full batch from client
    
    Return JSON format:
    [
      {
        "original": { ... },
        "category": "string",
        "confidence": number,
        "needsReview": boolean,
        "question": "string (optional)",
        "reasoning": "string"
      }
    ]
  `;

    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: "You are a helpful bookkeeping assistant." }, { role: "user", content: prompt }],
            model: "gpt-4-turbo-preview", // or gpt-3.5-turbo
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content from AI");

        const result = JSON.parse(content);
        const aiAnalyzed = result.transactions || result; // Handle potential wrapper

        // Merge results
        return [...analyzedTransactions, ...aiAnalyzed];
    } catch (error) {
        console.error("AI Analysis failed:", error);
        // Fallback mock response for demo if no API key
        const fallback = transactionsForAi.map(t => ({
            original: t,
            category: "Uncategorized",
            confidence: 0,
            needsReview: true,
            question: "What is this transaction for?",
            reasoning: "AI service unavailable"
        }));
        return [...analyzedTransactions, ...fallback];
    }
};
