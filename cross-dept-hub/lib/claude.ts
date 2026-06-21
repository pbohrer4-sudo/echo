// Anthropic model used across the hub's AI features (briefing + filing).
// Kept here so the model id lives in one place; the feature modules
// instantiate the Anthropic SDK directly with their own API key resolution.
export const CLAUDE_MODEL = "claude-sonnet-4-6";
