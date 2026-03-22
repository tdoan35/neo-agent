export interface Message {
  role: string;
  content: string | unknown;
}

/** Estimate token count for a string (chars / 4, conservative) */
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Count total tokens across all messages */
export function countMessageTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return sum + countTokens(content);
  }, 0);
}
