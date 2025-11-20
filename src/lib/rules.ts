import fs from 'fs';
import path from 'path';

export interface Rule {
    id: string;
    pattern: string;
    category: string;
    confidence: number;
    createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const RULES_FILE = path.join(DATA_DIR, 'rules.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const loadRules = (): Rule[] => {
    if (!fs.existsSync(RULES_FILE)) {
        return [];
    }
    try {
        const data = fs.readFileSync(RULES_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load rules:', error);
        return [];
    }
};

export const saveRule = (pattern: string, category: string): Rule => {
    const rules = loadRules();

    // Check for duplicates
    const existing = rules.find(r => r.pattern.toLowerCase() === pattern.toLowerCase());
    if (existing) {
        // Update existing rule
        existing.category = category;
        existing.createdAt = new Date().toISOString();
        fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
        return existing;
    }

    const newRule: Rule = {
        id: Math.random().toString(36).substring(7),
        pattern,
        category,
        confidence: 1.0,
        createdAt: new Date().toISOString()
    };

    rules.push(newRule);
    fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
    return newRule;
};

export const findMatchingRule = (description: string, rules: Rule[]): Rule | undefined => {
    const normalizedDesc = description.toLowerCase();
    // Simple containment match for now. Can be upgraded to regex later.
    return rules.find(r => normalizedDesc.includes(r.pattern.toLowerCase()));
};
