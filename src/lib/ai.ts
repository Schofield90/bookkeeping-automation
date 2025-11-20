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

export const analyzeTransactions = async (transactions: any[]): Promise<AnalyzedTransaction[]> => {
    // In a real app, we would batch these or send a summary if too many
    const prompt = `
    You are an expert bookkeeper. Analyze the following bank transactions and categorize them into standard Xero account codes (e.g., 'Office Expenses', 'Travel', 'Sales', 'Bank Fees').
    
    For each transaction:
    1. Assign a category.
    2. Assign a confidence score (0-1).
    3. If confidence is below 0.8, set needsReview to true and formulate a specific question to ask the user to clarify.
    
    Transactions:
    ${JSON.stringify(transactions)} // Full batch from client
    
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
        return result.transactions || result; // Handle potential wrapper
    } catch (error) {
        console.error("AI Analysis failed:", error);
        // Fallback mock response for demo if no API key
        return transactions.map(t => ({
            original: t,
            category: "Uncategorized",
            confidence: 0,
            needsReview: true,
            question: "What is this transaction for?",
            reasoning: "AI service unavailable"
        }));
    }
};
