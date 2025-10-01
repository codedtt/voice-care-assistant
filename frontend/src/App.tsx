import React, { useState, useRef, useEffect } from 'react';
import { Mic, Zap, MessageCircle, RefreshCw, Volume2, Link } from 'lucide-react';
import axios from 'axios';

// --- TYPE DEFINITIONS ---
interface Source {
    uri: string;
    title: string;
}

interface Message {
    role: 'user' | 'bot';
    text: string;
    sources?: Source[];
}

// --- CONFIGURATION ---
const BACKEND_API_URL = 'http://localhost:3000/api/query';

// --- GLOBAL INTERFACE DECLARATIONS (STT/TTS) ---
interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
}

interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number; 
    readonly [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
    readonly length: number;
    readonly [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
    readonly resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
}

declare global {
    interface SpeechRecognition extends EventTarget {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        start(): void;
        stop(): void;
        onresult: (event: SpeechRecognitionEvent) => void;
        onerror: (event: SpeechRecognitionErrorEvent) => void;
        onend: (event: Event) => void;
    }
    
    interface Window {
        SpeechRecognition: {
            prototype: SpeechRecognition;
            new (): SpeechRecognition;
        };
        webkitSpeechRecognition: {
            prototype: SpeechRecognition;
            new (): SpeechRecognition;
        };
    }
}

// --- TTS & STT INITIALIZATION ---
const synth = window.speechSynthesis;

const SpeechRecognitionClass = (window.SpeechRecognition || window.webkitSpeechRecognition) as { new(): SpeechRecognition } | undefined;

let recognition: SpeechRecognition | null = null;
if (SpeechRecognitionClass) {
    recognition = new SpeechRecognitionClass(); 
    recognition.continuous = false; 
    recognition.interimResults = false;
    recognition.lang = 'en-US';
}

// --- APP COMPONENT ---
const App: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'bot',
            text: "Hello! I'm your AI care assistant. Ask me about returns, shipping, order status, or product details.",
        },
    ]);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [tempTranscript, setTempTranscript] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // --- SCROLL TO BOTTOM ---
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // --- TTS ---
    const speak = (text: string) => {
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        // Find a preferred voice or use default
        const voice =
            synth.getVoices().find((v) => v.lang.startsWith('en-') && v.name.includes('Google')) ||
            synth.getVoices()[0];
        if (voice) utterance.voice = voice;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = (e) => {
            console.error('TTS error:', e);
            setIsSpeaking(false);
        };

        synth.speak(utterance);
    };

    // --- BARGE-IN HANDLER (stops bot speech) ---
    const handleBargeIn = () => {
        if (isSpeaking) {
            synth.cancel();
            setIsSpeaking(false);
        }
    };

    // --- API ---
    interface QueryResponse {
        answer: string;
        sources?: Source[]; 
    }

    const processUserQuery = async (queryText: string) => {
        if (!queryText.trim()) return;

        // 1. Logging: Log user query
        console.log(`[LOG] User Query: "${queryText}"`);

        setMessages((prev) => [...prev, { role: 'user', text: queryText }]);
        setIsTyping(true);

        // 2. Latency Measurement: Start timing
        const startTime = performance.now(); 

        try {
            const response = await axios.post<QueryResponse>(BACKEND_API_URL, { query: queryText });
            const botAnswer = response.data.answer;
            let botSources = response.data.sources || [];

            // 2. Latency Measurement: End timing and log
            const endTime = performance.now();
            const latency = (endTime - startTime).toFixed(2);
            console.log(`[LOG] API Latency: ${latency} ms`);
            
            // 1. Logging: Log bot response
            console.log(`[LOG] Bot Response: "${botAnswer}"`);


            // --- MOCK CITATION DATA FOR DEMO + NEW INTENT ---
            if (botSources.length === 0) {
                 if (queryText.toLowerCase().includes('order')) {
                    botSources = [{ 
                        uri: "https://example.com/order-lookup/123", 
                        title: "Order Tracking System v2.1" 
                    }];
                 } else if (queryText.toLowerCase().includes('return')) {
                    botSources = [{ 
                        uri: "https://example.com/returns-policy", 
                        title: "Customer Returns & Refunds Policy" 
                    }];
                 // 3. New Intent: Product Info/Details
                 } else if (queryText.toLowerCase().includes('product') || queryText.toLowerCase().includes('details')) { 
                    botSources = [{ 
                        uri: "https://example.com/product-catalog/sku-42", 
                        title: "Detailed Product Specifications for SKU-42" 
                    }];
                 } else {
                    botSources = [{
                        uri: "https://example.com/knowledge-base/general-faq",
                        title: "Company General FAQ"
                    }];
                 }
            }
            // ------------------------------------

            setMessages((prev) => [...prev, { role: 'bot', text: botAnswer, sources: botSources }]);
            speak(botAnswer);
        } catch (error) {
            // Log error with latency even on failure
            const endTime = performance.now();
            const latency = (endTime - startTime).toFixed(2);
            console.error(`[LOG] Backend API call failed (Latency: ${latency} ms):`, error); 
            
            const errorMessage =
                "Sorry, I'm having trouble connecting to my knowledge base. Please ensure the backend server is running.";
            setMessages((prev) => [...prev, { role: 'bot', text: errorMessage }]);
            speak(errorMessage);
        } finally {
            setIsTyping(false);
        }
    };

    // --- STT (Setup only runs once) ---
    useEffect(() => {
        if (!recognition) return; 

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            // ** BARGE-IN: Cancel speech as soon as a result is detected **
            handleBargeIn(); 
            
            const lastResult = event.results[event.results.length - 1];
            const transcript = lastResult[0].transcript;

            setTempTranscript(transcript); 

            if (lastResult.isFinal) {
                recognition!.stop();
                setIsListening(false);
                setTempTranscript('');
                processUserQuery(transcript);
            }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('STT Error:', event.error || event.message);
            setIsListening(false);
            setTempTranscript('');
        };

        recognition.onend = () => setIsListening(false);

        return () => {
            recognition?.stop();
            synth.cancel();
        };
    }, []); 

    const startListening = () => {
        if (!recognition) {
            console.error('Speech Recognition not supported. Use Chrome or Edge.');
            return;
        }
        
        // ** BARGE-IN: Cancel speech when the user explicitly starts listening **
        handleBargeIn();
        
        if (!isListening) {
            try {
                recognition.start();
                setIsListening(true);
            } catch (e) {
                console.error('Recognition start failed:', e);
                setIsListening(false);
            }
        }
    };

    // --- MESSAGE COMPONENT ---
    const MessageComponent: React.FC<{ message: Message }> = ({ message }) => {
        const isUser = message.role === 'user';
        
        // Inline styles for the message bubble
        const bubbleStyle: React.CSSProperties = {
            maxWidth: '80%', 
            padding: '0.75rem', 
            borderRadius: '0.75rem', 
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
            transition: 'all 300ms',
            backgroundColor: isUser ? '#3b82f6' : '#f3f4f6', // bg-blue-500 vs bg-gray-100
            color: isUser ? '#ffffff' : '#1f2937',        // text-white vs text-gray-800
            marginLeft: isUser ? 'auto' : '0',
            marginRight: isUser ? '0' : 'auto',
            marginBottom: '1rem',
            borderBottomRightRadius: isUser ? 0 : '0.75rem', // rounded-br-none
            borderTopLeftRadius: isUser ? '0.75rem' : 0,    // rounded-tl-none
        };

        const citationContainerStyle: React.CSSProperties = {
            marginTop: '0.5rem',
            paddingTop: '0.5rem',
            borderTop: isUser ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(0, 0, 0, 0.1)',
        };

        const citationLinkStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            fontSize: '0.7rem',
            color: isUser ? '#bfdbfe' : '#4f46e5', // blue-200 vs indigo-600
            textDecoration: 'none',
            wordBreak: 'break-all',
        };

        return (
            <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={bubbleStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', marginBottom: '0.25rem', fontWeight: '600', opacity: 0.75 }}>
                        {message.role === 'bot' ? <Zap size={14} style={{ marginRight: '0.25rem', color: '#9333ea' }} /> : <MessageCircle size={14} style={{ marginRight: '0.25rem' }} />}
                        {message.role === 'bot' ? 'Assistant' : 'You'}
                    </div>
                    <p style={{ fontSize: '0.875rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{message.text}</p>
                    
                    {/* CITATION RENDERING */}
                    {message.sources && message.sources.length > 0 && (
                        <div style={citationContainerStyle}>
                            <p style={{ fontSize: '0.75rem', fontWeight: '500', opacity: 0.8, marginBottom: '0.25rem', color: isUser ? '#e0f2f1' : '#4b5563' }}>
                                Cited Sources:
                            </p>
                            {message.sources.map((source, index) => (
                                <a 
                                    key={index} 
                                    href={source.uri} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    style={citationLinkStyle}
                                    title={source.title}
                                >
                                    <Link size={12} style={{ marginRight: '0.25rem', flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {source.title || new URL(source.uri).hostname}
                                    </span>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };
    
    // Inline styles for the main container
    const appContainerStyle: React.CSSProperties = {
        position: 'fixed',
        inset: 0, 
        backgroundColor: '#f9fafb', // bg-gray-50
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem', 
        fontFamily: 'Inter, sans-serif',
        boxSizing: 'border-box',
        overflow: 'hidden',
        zIndex: 10,
    };

    // Inline styles for the chat card
    const chatCardStyle: React.CSSProperties = {
        width: '100%',
        maxWidth: '48rem', 
        backgroundColor: '#ffffff',
        borderRadius: '1rem', 
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', 
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1, 
        maxHeight: '100%', 
    };

    // Inline styles for the header
    const headerStyle: React.CSSProperties = {
        padding: '1rem', 
        backgroundColor: '#9333ea', // bg-purple-600
        color: '#ffffff',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontWeight: '700', 
        fontSize: '1.25rem', 
        flexShrink: 0,
    };
    
    // Inline styles for the message area
    const messageAreaStyle: React.CSSProperties = {
        flexGrow: 1, 
        overflowY: 'auto', 
        padding: '1rem', 
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0, 
    };
    
    // Inline styles for the control area
    const controlAreaStyle: React.CSSProperties = {
        padding: '1rem', 
        backgroundColor: '#f3f4f6', // bg-gray-100
        borderTop: '1px solid #e5e7eb', 
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
    };

    return (
        <div style={appContainerStyle}>
            <div style={chatCardStyle}>
                
                {/* Header */}
                <header style={headerStyle}>
                    <h1 style={{ display: 'flex', alignItems: 'center' }}>
                        <Volume2 size={24} style={{ marginRight: '0.5rem' }} />
                        Voice Care Assistant
                    </h1>
                    <span 
                        style={{ fontSize: '0.875rem', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontWeight: '500', transition: 'background-color 300ms', backgroundColor: isSpeaking ? '#f87171' : '#7e22ce' }}
                    >
                        {isSpeaking ? 'Speaking...' : 'Ready'}
                    </span>
                </header>

                {/* Message Area */}
                <div style={messageAreaStyle}>
                    {messages.map((msg, index) => (
                        <MessageComponent key={index} message={msg} /> 
                    ))}
                    
                    {/* Typing Indicator */}
                    {isTyping && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <div style={{ 
                                maxWidth: '80%', 
                                padding: '0.75rem', 
                                borderRadius: '0.75rem', 
                                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
                                backgroundColor: '#f3f4f6', 
                                color: '#1f2937',
                                borderTopLeftRadius: 0,
                                marginBottom: '1rem',
                            }}>
                                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'flex-end', height: '24px' }}>
                                    {/* Dots using inline style for animation */}
                                    <span style={{ 
                                        display: 'block', 
                                        width: '6px', 
                                        height: '6px', 
                                        backgroundColor: '#4b5563', 
                                        borderRadius: '50%',
                                        animation: 'bounce-slow 1s infinite'
                                    }}></span>
                                    <span style={{ 
                                        display: 'block', 
                                        width: '6px', 
                                        height: '6px', 
                                        backgroundColor: '#4b5563', 
                                        borderRadius: '50%',
                                        animation: 'bounce-slow 1s infinite',
                                        animationDelay: '0.1s'
                                    }}></span>
                                    <span style={{ 
                                        display: 'block', 
                                        width: '6px', 
                                        height: '6px', 
                                        backgroundColor: '#4b5563', 
                                        borderRadius: '50%',
                                        animation: 'bounce-slow 1s infinite',
                                        animationDelay: '0.2s'
                                    }}></span>
                                </div>
                                {/* We need to define the animation in a style tag */}
                                <style>{`
                                    @keyframes bounce-slow {
                                        0%, 100% { transform: translateY(0); }
                                        50% { transform: translateY(-4px); }
                                    }
                                `}</style>
                            </div>
                        </div>
                    )}
                    
                    {/* Temporary Transcript while listening */}
                    {isListening && tempTranscript && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                            <div style={{ padding: '0.5rem', backgroundColor: '#fef3c7', color: '#b45309', fontSize: '0.875rem', borderRadius: '0.5rem', maxWidth: '80%', }}>
                                <p style={{ fontStyle: 'italic', textAlign: 'right' }}>Listening: {tempTranscript}...</p>
                            </div>
                        </div>
                    )}
                    
                    <div ref={messagesEndRef} />
                </div>

                {/* Input/Control Area */}
                <div style={controlAreaStyle}>
                    {/* Listening Status */}
                    <div style={{ textAlign: 'center', marginBottom: '0.5rem', height: '1.5rem' }}>
                        {isListening && (
                            <span 
                                style={{ fontSize: '0.875rem', fontWeight: '600', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Mic size={16} style={{ marginRight: '0.25rem' }} /> ACTIVE LISTENING...
                            </span>
                        )}
                        {!isListening && isSpeaking && (
                            <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Volume2 size={16} style={{ marginRight: '0.25rem' }} /> Bot is speaking...
                            </span>
                        )}
                    </div>
                    
                    {/* Controls */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                        <button
                            onClick={startListening}
                            disabled={isTyping}
                            style={{
                                padding: '1rem',
                                borderRadius: '50%',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                transition: 'all 300ms',
                                backgroundColor: isListening ? '#ef4444' : '#10b981', // red-500 vs green-500
                                color: '#ffffff',
                                opacity: isTyping ? 0.5 : 1,
                                cursor: isTyping ? 'not-allowed' : 'pointer',
                                border: isListening ? '4px solid #fca5a5' : 'none', // ring-4 ring-red-300
                            }}
                            title="Start Voice Input (Barge-in supported)"
                        >
                            <Mic size={24} />
                        </button>
                        
                        {/* Stop Speaking/TTS Button (Manual Barge-in) */}
                        <button
                            onClick={handleBargeIn}
                            disabled={!isSpeaking} // Only enable when the bot is actually speaking
                            style={{
                                padding: '1rem',
                                borderRadius: '50%',
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                transition: 'all 300ms',
                                backgroundColor: isSpeaking ? '#f97316' : '#d1d5db', // orange-500 vs gray-300
                                color: isSpeaking ? '#ffffff' : '#6b7280',        // text-white vs text-gray-500
                                opacity: !isSpeaking ? 0.5 : 1,
                                cursor: !isSpeaking ? 'not-allowed' : 'pointer',
                            }}
                            title="Stop Bot Speech (Barge-in)"
                        >
                            <Volume2 size={24} style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        
                        {/* Clear Button */}
                        <button
                            onClick={() => {
                                synth.cancel(); // Stop speaking on clear
                                setMessages([{
                                    role: 'bot',
                                    text: "Hello! I'm your AI care assistant. Ask me about returns, shipping, order status, or product details.",
                                }]);
                            }}
                            style={{
                                padding: '1rem',
                                borderRadius: '50%',
                                backgroundColor: '#d1d5db', // gray-300
                                color: '#1f2937',          // gray-800
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                transition: 'background-color 300ms',
                            }}
                            title="Clear Chat"
                        >
                            <RefreshCw size={24} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
