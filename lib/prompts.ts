import type { Message } from "./types";

export {
  DISCOVERY_INSTRUCTIONS,
} from "./chat.mjs";

export function buildConversationInput(messages: Message[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

export {
  INSIGHT_INSTRUCTIONS,
  INSIGHT_REPAIR_INSTRUCTIONS,
} from "./insights.mjs";
