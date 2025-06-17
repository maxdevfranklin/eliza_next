"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { ChatMessages } from "@/components/chat-messages";
import { TextareaWithActions } from "@/components/textarea-with-actions";
import { USER_NAME, CHAT_SOURCE } from "@/constants";
import SocketIOManager, {
  ControlMessageData,
  MessageBroadcastData,
} from "@/lib/socketio-manager";
import type { ChatMessage } from "@/types/chat-message";
import { getRoomMemories, createRoom, pingServer } from "@/lib/api-client";
import { generateQueryRoomId } from "@/lib/uuid-utils";

// Simple spinner component
const LoadingSpinner = () => (
  <svg
    className="animate-spin h-4 w-4 text-zinc-600 dark:text-zinc-400"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    ></circle>
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
);

export const Chat = () => {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  // --- Environment Configuration ---
  const agentId = process.env.NEXT_PUBLIC_AGENT_ID;
  const worldId = process.env.NEXT_PUBLIC_WORLD_ID || "00000000-0000-0000-0000-000000000000";
  const serverId = "00000000-0000-0000-0000-000000000000"; // Default server ID from ElizaOS

  // --- User Entity ---
  const [userEntity, setUserEntity] = useState<string | null>(null);

  // Initialize user entity on client side only to avoid hydration mismatch
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedEntity = localStorage.getItem('elizaHowUserEntity');
      if (storedEntity) {
        setUserEntity(storedEntity);
      } else {
        const newEntity = uuidv4();
        localStorage.setItem('elizaHowUserEntity', newEntity);
        setUserEntity(newEntity);
      }
    }
  }, []);

  // --- State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [inputDisabled, setInputDisabled] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);
  const [isAgentThinking, setIsAgentThinking] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [agentStatus, setAgentStatus] = useState<'checking' | 'ready' | 'error'>('checking');

  // --- Refs ---
  const initStartedRef = useRef(false);
  const socketIOManager = SocketIOManager.getInstance();

  // Check if environment is properly configured
  if (!agentId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-6">
          <h2 className="text-xl font-semibold mb-2">Configuration Error</h2>
          <p className="text-gray-600 mb-4">
            NEXT_PUBLIC_AGENT_ID is not configured in environment variables.
          </p>
          <p className="text-sm text-gray-500">
            Please check your .env file and ensure NEXT_PUBLIC_AGENT_ID is set.
          </p>
        </div>
      </div>
    );
  }

  // --- Check Server Status ---
  useEffect(() => {
    const checkServer = async () => {
      try {
        console.log("[Chat] Checking server status...");
        const isOnline = await pingServer();
        console.log("[Chat] Server ping result:", isOnline);
        setServerStatus(isOnline ? 'online' : 'offline');
        if (!isOnline) {
          setConnectionStatus('error');
        }
      } catch (error) {
        console.error("[Chat] Server check failed:", error);
        setServerStatus('offline');
        setConnectionStatus('error');
      }
    };

    checkServer();
  }, []);

  // --- Generate Room ID ---
  useEffect(() => {
    if (!userEntity || !agentId) return;
    
    if (query) {
      // Generate a room ID based on the query
      const queryRoomId = generateQueryRoomId(userEntity, query);
      setRoomId(queryRoomId);
      console.log(`[Chat] Generated room ID: ${queryRoomId} for query: "${query}"`);
    } else {
      // Use a default room for general chat
      setRoomId(`${agentId}-${userEntity}`);
    }
  }, [query, userEntity, agentId]);

  // --- Initialize Socket Connection ---
  useEffect(() => {
    if (!userEntity || !agentId || serverStatus !== 'online') {
      return;
    }

    const initializeConnection = async () => {
      console.log("[Chat] Initializing connection...");
      setConnectionStatus('connecting');
      
      try {
        // Step 1: Add agent to centralized channel
        const centralChannelId = "00000000-0000-0000-0000-000000000000";
        
        console.log("[Chat] Adding agent to centralized channel...");
        setAgentStatus('checking');
        
        try {
          const addAgentResponse = await fetch(`/api/eliza/messaging/central-channels/${centralChannelId}/agents`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              agentId: agentId
            })
          });
          
          if (addAgentResponse.ok) {
            console.log("[Chat] ✅ Agent successfully added to centralized channel");
            setAgentStatus('ready');
          } else {
            const errorText = await addAgentResponse.text();
            console.warn("[Chat] ⚠️ Failed to add agent to channel:", errorText);
            // Agent might already be in channel, treat as success
            setAgentStatus('ready');
          }
        } catch (error) {
          console.warn("[Chat] ⚠️ Error adding agent to channel:", error);
          // Continue anyway but mark as potential issue
          setAgentStatus('error');
        }

        // Step 2: Initialize socket connection
        console.log("[Chat] Initializing socket connection...");
        socketIOManager.initialize(userEntity, serverId);
        
        // Step 3: Check connection status
        const checkConnection = () => {
          if (socketIOManager.isSocketConnected()) {
            console.log("[Chat] ✅ Socket connected successfully");
            setConnectionStatus('connected');
          } else {
            setTimeout(checkConnection, 1000); // Check again in 1 second
          }
        };
        
        checkConnection();
        
      } catch (error) {
        console.error("[Chat] ❌ Failed to initialize connection:", error);
        setConnectionStatus('error');
      }
    };

    initializeConnection();
  }, [userEntity, agentId, serverStatus, socketIOManager]);

  // --- Set up Socket Event Listeners ---
  useEffect(() => {
    if (connectionStatus !== 'connected' || !roomId) {
      return;
    }

    console.log("[Chat] Setting up socket event listeners...");

    // Message broadcast handler
    const handleMessageBroadcast = (data: MessageBroadcastData) => {
      console.log("[Chat] Received message broadcast:", data);
      
      // Skip our own messages to avoid duplicates
      if (data.senderId === userEntity) {
        console.log("[Chat] Skipping our own message broadcast");
        return;
      }
      
      // Check if this is an agent message (either by sender ID or by coming from centralized channel)
      const isAgentMessage = data.senderId === agentId || 
                           data.channelId === "00000000-0000-0000-0000-000000000000" ||
                           data.roomId === "00000000-0000-0000-0000-000000000000";
      
      const message: ChatMessage = {
        id: data.id || uuidv4(),
        name: data.senderName || (isAgentMessage ? "Agent" : "User"),
        text: data.text,
        senderId: data.senderId,
        roomId: data.roomId || data.channelId || roomId,
        createdAt: data.createdAt || Date.now(),
        source: data.source,
        thought: data.thought,
        actions: data.actions,
        isLoading: false,
      };

      console.log("[Chat] Adding message:", { isAgentMessage, message });
      setMessages((prev) => [...prev, message]);
      
      // If this was an agent response, stop the thinking indicator
      if (isAgentMessage) {
        setIsAgentThinking(false);
      }
    };

    // Control message handler
    const handleControlMessage = (data: ControlMessageData) => {
      console.log("[Chat] Received control message:", data);
      
      if (data.action === 'disable_input') {
        setInputDisabled(true);
      } else if (data.action === 'enable_input') {
        setInputDisabled(false);
      }
    };

    // Message complete handler
    const handleMessageComplete = () => {
      console.log("[Chat] Message complete");
      setIsAgentThinking(false);
      setInputDisabled(false);
    };

    // Attach event listeners
    socketIOManager.on('messageBroadcast', handleMessageBroadcast);
    socketIOManager.on('controlMessage', handleControlMessage);
    socketIOManager.on('messageComplete', handleMessageComplete);

    // Join the room and also join as channel if we have a channelId
    socketIOManager.joinRoom(roomId);
    
    // Join the centralized bus channel (always 00000000-0000-0000-0000-000000000000)
    const centralChannelId = "00000000-0000-0000-0000-000000000000";
    console.log("[Chat] Joining centralized bus channel:", centralChannelId);
    socketIOManager.joinChannel(centralChannelId, serverId);

    // Cleanup function
    return () => {
      socketIOManager.off('messageBroadcast', handleMessageBroadcast);
      socketIOManager.off('controlMessage', handleControlMessage);
      socketIOManager.off('messageComplete', handleMessageComplete);
      socketIOManager.leaveRoom(roomId);
      socketIOManager.leaveChannel("00000000-0000-0000-0000-000000000000");
    };
  }, [connectionStatus, roomId, socketIOManager]);

  // --- Load Message History ---
  useEffect(() => {
    if (!roomId || !agentId || connectionStatus !== 'connected' || initStartedRef.current) {
      return;
    }
    
    initStartedRef.current = true;
    setIsLoadingHistory(true);

    console.log(`[Chat] Loading message history for room: ${roomId}`);

    getRoomMemories(agentId, roomId, 50)
      .then((loadedMessages) => {
        console.log(`[Chat] Loaded ${loadedMessages.length} messages from history`);
        setMessages(loadedMessages);
      })
      .catch((error) => {
        console.error("[Chat] Failed to load message history:", error);
        // Continue even if history loading fails
      })
      .finally(() => {
        setIsLoadingHistory(false);
      });
  }, [roomId, agentId, connectionStatus]);

  // --- Send Message Logic ---
  const sendMessage = useCallback(
    (messageText: string) => {
      if (
        !messageText.trim() ||
        !userEntity ||
        !roomId ||
        inputDisabled ||
        connectionStatus !== 'connected'
      ) {
        console.warn("[Chat] Cannot send message:", {
          hasText: !!messageText.trim(),
          hasUserEntity: !!userEntity,
          hasRoomId: !!roomId,
          inputDisabled,
          connectionStatus,
        });
        return;
      }

      const userMessage: ChatMessage = {
        id: uuidv4(),
        name: USER_NAME,
        text: messageText,
        senderId: userEntity,
        roomId: roomId,
        createdAt: Date.now(),
        source: CHAT_SOURCE,
        isLoading: false,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsAgentThinking(true);
      setInputDisabled(true);

      // Send message via socket to centralized bus channel
      const centralChannelId = "00000000-0000-0000-0000-000000000000";
      console.log("[Chat] Sending message to central channel:", { messageText, centralChannelId, source: CHAT_SOURCE });
      
      // Send to centralized bus channel
      socketIOManager.sendChannelMessage(messageText, centralChannelId, CHAT_SOURCE);
      
      // Add a timeout to re-enable input if no response comes (safety measure)
      setTimeout(() => {
        console.log("[Chat] Timeout reached, re-enabling input");
        setInputDisabled(false);
        setIsAgentThinking(false);
      }, 30000); // 30 seconds timeout
    },
    [userEntity, roomId, inputDisabled, connectionStatus, socketIOManager],
  );

  // --- Handle Form Submit ---
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (input.trim()) {
        sendMessage(input.trim());
        setInput("");
      }
    },
    [input, sendMessage],
  );

  // --- Render Connection Status ---
  const renderConnectionStatus = () => {
    if (serverStatus === 'checking') {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <LoadingSpinner />
          Checking server connection...
        </div>
      );
    }

    if (serverStatus === 'offline') {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-red-700 font-medium">Server Offline</span>
          </div>
          <p className="text-red-600 text-sm mt-1">
            Cannot connect to ElizaOS server at {process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'}
          </p>
        </div>
      );
    }

    if (connectionStatus === 'connecting') {
      const statusText = agentStatus === 'checking' 
        ? 'Setting up agent participation...' 
        : agentStatus === 'ready' 
        ? 'Connecting to agent...' 
        : 'Connecting (agent setup failed)...';
        
      return (
        <div className="flex items-center gap-2 text-sm text-blue-600 mb-4">
          <LoadingSpinner />
          {statusText}
        </div>
      );
    }

    if (connectionStatus === 'error') {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-red-700 font-medium">Connection Error</span>
          </div>
          <p className="text-red-600 text-sm mt-1">
            Failed to connect to the agent. Please try refreshing the page.
          </p>
        </div>
      );
    }

    if (connectionStatus === 'connected') {
      return (
        <div className="flex items-center gap-2 text-sm text-green-600 mb-4">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          Connected to Agent
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen w-full max-w-4xl mx-auto flex flex-col justify-end">
      {/* Chat Messages */}
      <div className="flex-shrink-0 max-h-96 overflow-y-auto px-4 mb-4">
        {isLoadingHistory ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2">
              <LoadingSpinner />
              <span className="text-gray-600">Loading conversation history...</span>
            </div>
          </div>
        ) : (
          <>
            <ChatMessages 
              messages={messages} 
              citationsMap={{}}
              followUpPromptsMap={{}}
              onFollowUpClick={(prompt) => {
                // Handle follow-up prompts by setting as new input
                setInput(prompt);
              }}
            />
            {isAgentThinking && (
              <div className="flex items-center gap-2 p-4 text-gray-600">
                <LoadingSpinner />
                <span>Agent is thinking...</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Section - Header, Status, and Input */}
      <div className="flex-shrink-0">
        {/* Header */}
        <div className="p-4 pb-2">
          <h1 className="text-2xl font-bold mb-2">Chat with ElizaOS Agent</h1>
          {query && (
            <div className="text-gray-600 text-base break-words overflow-wrap-anywhere word-break-break-all">
              <span>Query: </span>
              <span className="font-medium">"{query}"</span>
            </div>
          )}
        </div>

        {/* Connection Status */}
        <div className="px-4">
          {renderConnectionStatus()}
        </div>

        {/* Input Area */}
        <div className="p-4 pt-2">
          <div className="w-full">
            <TextareaWithActions
              input={input}
              onInputChange={(e) => setInput(e.target.value)}
              onSubmit={handleSubmit}
              isLoading={isAgentThinking || inputDisabled || connectionStatus !== 'connected'}
              placeholder={
                connectionStatus === 'connected' 
                  ? "Type your message..." 
                  : "Connecting..."
              }
            />
          </div>
        </div>
      </div>

      {/* Debug Info (Only when NEXT_PUBLIC_DEBUG is enabled) */}
      {process.env.NEXT_PUBLIC_DEBUG === 'true' && (
        <div className="mt-4 p-2 bg-gray-100 rounded text-xs text-gray-600">
          <div>Agent ID: {agentId}</div>
          <div>Room ID: {roomId}</div>
          <div>User Entity: {userEntity}</div>
          <div>Connection: {connectionStatus}</div>
          <div>Server: {serverStatus}</div>
          <div>Agent Status: {agentStatus}</div>
          <div>Input Disabled: {inputDisabled ? 'true' : 'false'}</div>
          <div>Agent Thinking: {isAgentThinking ? 'true' : 'false'}</div>
        </div>
      )}
    </div>
  );
};

export default Chat;