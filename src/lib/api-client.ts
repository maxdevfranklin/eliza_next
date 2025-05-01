import type { ChatMessage } from "@/types/chat-message";
import { assert } from "@/utils/assert";

const API_PREFIX =
  (process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000") + "/api"; // Assuming backend is proxied or on same origin

console.log("API_PREFIX", API_PREFIX);

// Simplified representation of backend Memory type for parsing
interface BackendMemory {
  id: string;
  entityId: string; // UUID of sender (user or agent)
  agentId: string; // UUID of the agent this memory belongs to
  roomId: string; // UUID of the room (which is also agentId in this case)
  content: {
    text?: string;
    source?: string;
    thought?: string;
    actions?: string[];
    // other potential fields from backend Content
    [key: string]: any;
  };
  metadata?: {
    entityName?: string;
    // other potential metadata
    [key: string]: any;
  };
  createdAt: number;
  worldId?: string;
  // other potential fields from backend Memory
  [key: string]: any;
}

/**
 * Basic fetch wrapper
 */
const fetcher = async (
  url: string,
  options: RequestInit = {},
): Promise<any> => {
  const fullUrl = API_PREFIX + (url.startsWith("/") ? url : `/${url}`);
  console.log(`[API Client] Fetching: ${options.method || "GET"} ${fullUrl}`);
  try {
    const response = await fetch(fullUrl, { ...options });
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text();
      }
      console.error("[API Client] Fetch error:", {
        status: response.status,
        statusText: response.statusText,
        data: errorData,
      });
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }
    // Check content type before parsing
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text(); // Return text for non-JSON
  } catch (error) {
    console.error("[API Client] Network or parsing error:", error);
    throw error; // Re-throw the error
  }
};

/**
 * Fetches message history for a given agent and room.
 */
export const getAgentMemories = async (
  agentId: string,
  roomId: string,
): Promise<ChatMessage[]> => {
  assert(
    agentId && typeof agentId === "string",
    "[getAgentMemories] Invalid agentId",
  );
  assert(
    roomId && typeof roomId === "string",
    "[getAgentMemories] Invalid roomId",
  );
  if (!agentId || !roomId) return [];

  try {
    // Use the specific room ID provided
    const url = `/agents/${agentId}/rooms/${roomId}/memories`;
    const response = await fetcher(url);

    // Validate response structure (basic)
    assert(
      response && typeof response === "object",
      `[getAgentMemories] Invalid response structure: ${typeof response}`,
    );
    assert(
      response.success === true,
      `[getAgentMemories] API request was not successful: ${JSON.stringify(response.error)}`,
    );
    assert(
      response.data && Array.isArray(response.data.memories),
      `[getAgentMemories] Missing or invalid data.memories array: ${typeof response.data?.memories}`,
    );

    if (!response.success || !Array.isArray(response.data?.memories)) {
      console.error(
        "[getAgentMemories] Failed to get valid memories from API.",
        response,
      );
      return []; // Return empty on failure
    }

    const memories: BackendMemory[] = response.data.memories;
    console.log(
      `[getAgentMemories] Received ${memories.length} memories from API.`,
    );

    // Transform backend Memory to frontend ChatMessage
    const chatMessages: ChatMessage[] = memories
      .map((mem) => {
        const isUser = mem.entityId !== mem.agentId; // Simple check
        const message: ChatMessage = {
          id: mem.id,
          name: isUser
            ? mem.metadata?.entityName || "User"
            : mem.metadata?.entityName || "Agent",
          text:
            mem.content?.text ||
            (mem.content?.thought ? `*${mem.content.thought}*` : ""),
          senderId: mem.entityId,
          roomId: mem.roomId,
          createdAt: mem.createdAt || Date.now(),
          isLoading: false,
          source: mem.content?.source,
          thought: mem.content?.thought,
          actions: Array.isArray(mem.content?.actions)
            ? mem.content.actions
            : undefined,
        };
        // Add assertion for the transformed message
        assert(
          typeof message.name === "string" && message.text !== undefined,
          `[getAgentMemories] Invalid transformed message: ${JSON.stringify(message)}`,
        );
        return message;
      })
      .sort((a, b) => a.createdAt - b.createdAt); // Ensure chronological order

    return chatMessages;
  } catch (error) {
    console.error(
      "[getAgentMemories] Error fetching or processing memories:",
      error,
    );
    return []; // Return empty array on error
  }
};
