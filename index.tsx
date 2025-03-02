import { findByProps } from "@webpack";
import { definePluginSettings } from "@api/Settings";
import { Margins } from "@utils/margins";
import { closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { classNameFactory } from "@api/Styles";
import { Button, ChannelStore, Forms, React, useState, MessageStore } from "@webpack/common";
import { ErrorCard } from "@components/ErrorCard";
import { Link } from "@components/Link";
import { Logger } from "@utils/Logger";

const logger = new Logger("AiMessageAssistant");

const MODEL_NAME = "llama-3.3-70b-versatile";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

const cl = classNameFactory("vc-ai-");

const StarIcon = props => (
    <svg
        {...props}
        width="24"
        height="24"
        viewBox="0 0 36 36"
        fill="none"
        style={{ color: 'var(--interactive-normal)' }}
    >
        <path fill="currentColor" d="M34.347 16.893l-8.899-3.294l-3.323-10.891a1 1 0 0 0-1.912 0l-3.322 10.891l-8.9 3.294a1 1 0 0 0 0 1.876l8.895 3.293l3.324 11.223a1 1 0 0 0 1.918-.001l3.324-11.223l8.896-3.293a.998.998 0 0 0-.001-1.875z"></path>
        <path fill="currentColor" opacity="0.7" d="M14.347 27.894l-2.314-.856l-.9-3.3a.998.998 0 0 0-1.929-.001l-.9 3.3l-2.313.856a1 1 0 0 0 0 1.876l2.301.853l.907 3.622a1 1 0 0 0 1.94-.001l.907-3.622l2.301-.853a.997.997 0 0 0 0-1.874zM10.009 6.231l-2.364-.875l-.876-2.365a.999.999 0 0 0-1.876 0l-.875 2.365l-2.365.875a1 1 0 0 0 0 1.876l2.365.875l.875 2.365a1 1 0 0 0 1.876 0l.875-2.365l2.365-.875a1 1 0 0 0 0-1.876z"></path>
    </svg>
);

async function getAIResponse(chatData, apiKey, temperature) {
    if (apiKey.startsWith("Bearer ")) {
        apiKey = apiKey.substring(7);
    }

    try {
        logger.info("Sending request to Groq API");

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                messages: chatData,
                temperature: temperature || 1,
                max_completion_tokens: 1024,
                top_p: 1,
                stream: true,
                stop: null
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            logger.error(`HTTP error! Status: ${response.status}`, errorData);
            throw new Error(`API Error (${response.status}): ${errorData}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Failed to get response reader");

        let responseMessage = "";
        let decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n\n");

            for (const line of lines) {
                if (line.trim() === "" || line.includes("data: [DONE]")) continue;

                const jsonStr = line.replace(/^data: /, "");
                try {
                    const result = JSON.parse(jsonStr);
                    if (result?.choices?.[0]?.delta?.content) {
                        responseMessage += result.choices[0].delta.content;
                    }
                } catch (e) {
                    continue;
                }
            }
        }

        logger.info("Completed AI response");
        return responseMessage;
    } catch (error) {
        logger.error("Error getting AI response:", error);
        const errorMsg = typeof error === 'object' ?
            (error?.message || JSON.stringify(error)) :
            String(error);
        return `Error: ${errorMsg}`;
    }
}

function AIModal({ rootProps, message, contextMessages, close }) {
    const [prompt, setPrompt] = useState("");
    const [response, setResponse] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [hasAsked, setHasAsked] = useState(false);

    const handleSubmit = async () => {
        setIsLoading(true);
        setResponse("");

        const chatData = [];

        contextMessages.forEach(msg => {
            const username = msg.author?.username || "User";
            const messageContent = msg.content || "";
            chatData.push({
                role: "user",
                content: username + ": " + messageContent
            });
        });

        const currentUsername = message.author?.username || "User";
        const currentContent = message.content || "";
        chatData.push({
            role: "user",
            content: currentUsername + ": " + currentContent
        });

        if (prompt && prompt.trim()) {
            chatData.push({
                role: "user",
                content: prompt
            });
        }

        try {
            const apiKey = settings.store.apiKey || "";
            const temperature = settings.store.temperature || 0.7;
            const aiResponse = await getAIResponse(chatData, apiKey, temperature);
            setResponse(aiResponse);
            setHasAsked(true);
        } catch (error) {
            logger.error("Error in handleSubmit:", error);
            const errorMsg = typeof error === 'object' ?
                (error?.message || JSON.stringify(error)) :
                String(error);
            setResponse(`Error: ${errorMsg}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <ModalRoot {...rootProps} className={cl("modal")}>
            <ModalHeader className={cl("modal-header")}>
                <Forms.FormTitle tag="h2" className={cl("modal-title")}>
                    {settings.store.name || "AI Message Assistant"}
                </Forms.FormTitle>
                <ModalCloseButton onClick={close} className={cl("modal-close-button")} />
            </ModalHeader>

            <ModalContent className={cl("modal-content")}>
                <Forms.FormTitle className={Margins.bottom8}>Context Messages</Forms.FormTitle>
                <div className={cl("context-messages")}>
                    {contextMessages.map((msg, i) => (
                        <div key={i} className={cl("context-message")}>
                            <strong>{msg.author?.username || "User"}</strong><span className={cl("message-colon")}>:</span> <span>{msg.content || ""}</span>
                        </div>
                    ))}
                    <div className={cl("current-message")}>
                        <strong>{message.author?.username || "User"}</strong><span className={cl("message-colon")}>:</span> <span>{message.content || ""}</span>
                    </div>
                </div>

                <Forms.FormTitle className={Margins.top16}>Ask</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom8}>Add any additional information or specific questions here</Forms.FormText>
                <textarea
                    className={cl("prompt-input")}
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="What would you like to know about this message?"
                    rows={3}
                />

                {response && (
                    <>
                        <Forms.FormTitle className={Margins.top16}>AI Response</Forms.FormTitle>
                        <div className={cl("response-container")}>
                            <div className={cl("response")}>
                                {response}
                            </div>
                        </div>
                    </>
                )}
            </ModalContent>

            <ModalFooter>
                <div className={cl("footer-buttons")}>
                    <Button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        color={Button?.Colors?.BRAND}
                    >
                        {isLoading ? "Processing..." : (hasAsked ? "Ask AI Again" : "Ask AI")}
                    </Button>
                    <Button
                        onClick={close}
                        look={Button?.Looks?.LINK}
                    >
                        Close
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

const settings = definePluginSettings({
    name: {
        type: OptionType.STRING,
        default: "AI Message Assistant",
        description: "The name of the assistant button",
    },
    apiKey: {
        type: OptionType.STRING,
        default: "",
        description: "Your Groq API key"
    },
    temperature: {
        type: OptionType.SLIDER,
        default: 0.7,
        description: "AI response creativity (0 = focused, 1 = creative)",
        markers: [0, 0.25, 0.5, 0.75, 1],
        stickToMarkers: false
    }
});

export default definePlugin({
    name: "AiMessageAssistant",
    description: "Analyze messages with AI using Groq's llama-3.3-70b model",
    authors: [{ name: "GplateGam", id: 1278091053836009522n }],

    settings,

    start() {
        logger.info("Plugin started");
        this.injectStyles();
    },

    stop() {
        logger.info("Plugin stopped");
        this.removeStyles();
    },

    openAIModal(message) {
        logger.info(`Opening AI modal for message ${message?.id}`);

        try {
            const channel = ChannelStore.getChannel(message.channel_id) ||
                findByProps("getPrivateChannels")?.getChannel(message.channel_id);

            if (!channel) {
                logger.error(`Could not find channel for ID: ${message.channel_id}`);

                const contextMessages = [];

                const key = openModal(props => (
                    <AIModal
                        rootProps={props}
                        message={message}
                        contextMessages={contextMessages}
                        close={() => closeModal(key)}
                    />
                ));

                return;
            }

            const messages = MessageStore.getMessages(message.channel_id);

            if (!messages || !messages.toArray) {
                logger.error(`Could not find messages for channel ID: ${message.channel_id}`);

                const contextMessages = [];

                const key = openModal(props => (
                    <AIModal
                        rootProps={props}
                        message={message}
                        contextMessages={contextMessages}
                        close={() => closeModal(key)}
                    />
                ));

                return;
            }

            const messagesArray = Array.isArray(messages) ? messages : messages.toArray();

            const messageIndex = messagesArray.findIndex(msg => msg.id === message.id);

            let contextMessages = [];
            if (messageIndex >= 0) {
                contextMessages = messagesArray.slice(Math.max(0, messageIndex - 4), messageIndex);
            }

            logger.info(`Found ${contextMessages.length} context messages`);

            const key = openModal(props => (
                <AIModal
                    rootProps={props}
                    message={message}
                    contextMessages={contextMessages}
                    close={() => closeModal(key)}
                />
            ));
        } catch (error) {
            logger.error("Error opening AI modal:", error);

            const ErrorModalContent = () => {
                const [prompt, setPrompt] = useState("");
                const [response, setResponse] = useState("");
                const [isLoading, setIsLoading] = useState(false);
                const [hasAsked, setHasAsked] = useState(false);

                const handleAsk = async () => {
                    if (!prompt.trim()) return;

                    setIsLoading(true);

                    try {
                        const chatData = [
                            {
                                role: "user",
                                content: `${message.author?.username || "User"}: ${message.content || ""}`
                            },
                            {
                                role: "user",
                                content: prompt
                            }
                        ];

                        const apiKey = settings.store.apiKey || "";
                        const temperature = settings.store.temperature || 0.7;
                        const aiResponse = await getAIResponse(chatData, apiKey, temperature);
                        setResponse(aiResponse);
                        setHasAsked(true);
                    } catch (error) {
                        logger.error("Error getting AI response:", error);
                        setResponse("Error: Failed to get AI response. Please check your API key and try again.");
                    } finally {
                        setIsLoading(false);
                    }
                };

                return (
                    <>
                        <Forms.FormTitle className={Margins.top16}>Message</Forms.FormTitle>

                        <div className={cl("current-message")}>
                            <strong>{message.author?.username || "User"}</strong><span className={cl("message-colon")}>:</span> <span>{message.content || ""}</span>
                        </div>

                        <div className={cl("error-card")}>
                            <div className={cl("error-title")}>Limited Context</div>
                            <Forms.FormText className={Margins.top8}>
                                Could not load previous messages. Only the current message is available.
                            </Forms.FormText>
                        </div>

                        <Forms.FormTitle className={Margins.top16}>Ask</Forms.FormTitle>
                        <textarea
                            className={cl("prompt-input")}
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder="What would you like to know about this message?"
                            rows={3}
                        />

                        {response && (
                            <>
                                <Forms.FormTitle className={Margins.top16}>AI Response</Forms.FormTitle>
                                <div className={cl("response-container")}>
                                    <div className={cl("response")}>
                                        {response}
                                    </div>
                                </div>
                            </>
                        )}

                        <div className={Margins.top16}>
                            <div className={cl("footer-buttons")}>
                                <Button
                                    onClick={handleAsk}
                                    disabled={isLoading || !prompt.trim()}
                                    color={Button?.Colors?.BRAND}
                                >
                                    {isLoading ? "Processing..." : (hasAsked ? "Ask AI Again" : "Ask AI")}
                                </Button>
                                <Button
                                    onClick={() => closeModal(key)}
                                    look={Button?.Looks?.LINK}
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    </>
                );
            };

            const key = openModal(props => (
                <ModalRoot {...props} className={cl("modal")}>
                    <ModalHeader className={cl("modal-header")}>
                        <Forms.FormTitle tag="h2" className={cl("modal-title")}>
                            {settings.store.name || "AI Message Assistant"}
                        </Forms.FormTitle>
                        <ModalCloseButton onClick={() => closeModal(key)} className={cl("modal-close-button")} />
                    </ModalHeader>

                    <ModalContent className={cl("modal-content")}>
                        <ErrorModalContent />
                    </ModalContent>
                </ModalRoot>
            ));
        }
    },

    renderMessagePopoverButton(message) {
        return {
            label: settings.store.name || "AI Message Assistant",
            icon: StarIcon,
            message: message,
            onClick: () => {
                logger.info(`Button clicked for message ${message?.id}`);
                this.openAIModal(message);
            }
        };
    },

    injectStyles() {
    const css = `
        .vc-ai-modal {
            max-width: 600px;
        }
        
        .vc-ai-modal-title {
            margin-right: 16px;
            margin-bottom: 8px;
        }
        
        .vc-ai-modal-header {
            padding-bottom: 8px;
        }
        
        .vc-ai-context-messages {
            background-color: var(--background-secondary);
            border-radius: 8px;
            padding: 12px;
            max-height: 160px;
            overflow-y: auto;
            margin-bottom: 16px;
            user-select: text;
            -webkit-user-select: text;
        }
        
        .vc-ai-context-message {
            padding: 4px 0;
            opacity: 0.9;
            user-select: text;
            -webkit-user-select: text;
        }
        
        .vc-ai-context-message strong,
        .vc-ai-current-message strong,
        .vc-ai-message-colon {
            color: var(--header-primary);
            font-weight: 600;
            user-select: text;
            -webkit-user-select: text;
        }
        
        .vc-ai-context-message span,
        .vc-ai-current-message span,
        .vc-ai-response {
            color: var(--text-normal);
            user-select: text;
            -webkit-user-select: text;
        }
        
        .vc-ai-current-message {
            padding: 4px 0;
            border-top: 1px solid var(--background-tertiary);
            margin-top: 4px;
            font-weight: 500;
            user-select: text;
            -webkit-user-select: text;
        }
        
        .vc-ai-prompt-input {
            width: 95%;
            padding: 8px;
            background-color: var(--background-secondary);
            border: 1px solid var(--background-tertiary);
            border-radius: 4px;
            color: var(--text-normal);
            font-family: var(--font-primary);
            font-size: 14px;
            resize: vertical;
            outline: none;
            transition: border-color .2s ease-in-out;
            user-select: text;
            -webkit-user-select: text;
        }
        
        .vc-ai-prompt-input:focus {
            border-color: var(--text-link);
        }
        
        .vc-ai-response-container {
            animation: fadeIn 0.5s ease-in-out forwards;
            margin-bottom: 20px;
            user-select: text;
            -webkit-user-select: text;
        }
        
        .vc-ai-response {
            white-space: pre-wrap;
            background-color: var(--background-secondary);
            border-radius: 8px;
            padding: 12px;
            font-size: 14px;
            line-height: 1.4;
            user-select: text;
            -webkit-user-select: text;
            overflow-y: auto;
            max-height: 300px;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        
        .vc-ai-error-card {
            padding: 12px;
            margin-top: 12px;
            margin-bottom: 16px;
            background-color: rgba(237, 66, 69, 0.1);
            border-left: 4px solid var(--status-danger);
            border-radius: 4px;
            user-select: text;
            -webkit-user-select: text;
        }
        
        .vc-ai-error-card .vc-ai-error-title {
            color: var(--header-primary);
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            user-select: text;
            -webkit-user-select: text;
        }
        
        .vc-ai-modal-content {
            padding-bottom: 16px;
        }
        
        .vc-ai-footer-buttons {
            display: flex;
            gap: 8px;
            background: none;
        }

        .vc-ai-context-messages::-webkit-scrollbar,
        .vc-ai-response::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }
        
        .vc-ai-context-messages::-webkit-scrollbar-track,
        .vc-ai-response::-webkit-scrollbar-track {
            background-color: var(--scrollbar-auto-track);
            border-radius: 10px;
        }
        
        .vc-ai-context-messages::-webkit-scrollbar-thumb,
        .vc-ai-response::-webkit-scrollbar-thumb {
            background-color: var(--scrollbar-auto-thumb);
            border-radius: 10px;
            border: 2px solid var(--scrollbar-auto-track);
        }
        
        .vc-ai-context-messages::-webkit-scrollbar-thumb:hover,
        .vc-ai-response::-webkit-scrollbar-thumb:hover {
            background-color: var(--scrollbar-auto-thumb-hover);
        }

        .vc-ai-context-messages,
        .vc-ai-response {
            scrollbar-width: thin;
            scrollbar-color: var(--scrollbar-auto-thumb) var(--scrollbar-auto-track);
        }
    `;

    const style = document.createElement("style");
    style.textContent = css;
    style.id = "ai-message-assistant-styles";
    document.head.appendChild(style);

    this.styleElement = style;
},

    removeStyles() {
        if (this.styleElement) {
            this.styleElement.remove();
        }
    },

    settingsAboutComponent() {
        return (
            <>
                <Forms.FormText className={Margins.bottom8}>
                    This plugin allows you to analyze Discord messages using AI powered by Groq's llama-3.3-70b-versatile model.
                </Forms.FormText>

                <Forms.FormText className={Margins.bottom8}>
                    To use this plugin, you need to provide your own Groq API key in the settings above.
                </Forms.FormText>

                <Forms.FormDivider className={Margins.top16 + " " + Margins.bottom16} />

                <Forms.FormTitle tag="h3">How to use</Forms.FormTitle>
                <Forms.FormText className={Margins.bottom8}>
                    1. Hover over any message and click the star icon
                </Forms.FormText>
                <Forms.FormText className={Margins.bottom8}>
                    2. Enter any additional context or specific questions
                </Forms.FormText>
                <Forms.FormText className={Margins.bottom16}>
                    3. Click "Ask AI" to generate a response
                </Forms.FormText>

                <Forms.FormTitle tag="h3">Get a Groq API Key</Forms.FormTitle>
                <Forms.FormText>
                    Get your API key from <Link href="https://console.groq.com/keys">Groq's website</Link> and enter it in the settings above.
                </Forms.FormText>

                {!settings.store.apiKey || typeof settings.store.apiKey !== 'string' || settings.store.apiKey.trim() === '' ? (
                    <ErrorCard className={Margins.top8}>
                        <Forms.FormTitle>No API Key</Forms.FormTitle>
                        <Forms.FormText>You need to add a Groq API key in the settings for this plugin to work.</Forms.FormText>
                    </ErrorCard>
                ) : null}
            </>
        );
    }
});
