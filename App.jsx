import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './App.css'; // Ensure to import CSS
import { FaMicrophone } from 'react-icons/fa';
import { AiOutlineArrowRight } from 'react-icons/ai';

const ResponseDisplay = ({ userInput, response }) => (
    <div className="response-animation">
        <div className="response-circle">
            <p><strong>Your Input:</strong> {userInput}</p>
            <p><strong>Chatbot:</strong> {response}</p>
        </div>
    </div>
);

ResponseDisplay.propTypes = {
    userInput: PropTypes.string.isRequired,
    response: PropTypes.string.isRequired,
};

const VoiceInputModal = ({ onClose }) => (
    <div className="voice-input-modal">
        <div className="circle-background">
            <h2>Listening...</h2>
            <div className="button-container">
                <button onClick={onClose} className="cancel-button">Cancel</button>
            </div>
        </div>
    </div>
);

VoiceInputModal.propTypes = {
    onClose: PropTypes.func.isRequired,
};

const App = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [response, setResponse] = useState(""); 
    const [error, setError] = useState(""); 
    const [userInput, setUserInput] = useState(""); 
    const [selectedVoice, setSelectedVoice] = useState(0); 
    const [isRecording, setIsRecording] = useState(false); 
    const [voices, setVoices] = useState([]); 
    const [showVoices, setShowVoices] = useState(false); 
    const [isModalOpen, setIsModalOpen] = useState(false); 

    const synth = window.speechSynthesis;

    useEffect(() => {
        const fetchVoices = () => {
            const availableVoices = synth.getVoices();
            setVoices(availableVoices);
        };

        fetchVoices();
        synth.onvoiceschanged = fetchVoices;
    }, [synth]);

    const startSpeechRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert('Speech Recognition is not supported in this browser.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.start();

        recognition.onstart = () => {
            console.log("Speech recognition started");
            setIsLoading(true);
            setIsRecording(true);
            setIsModalOpen(true);
        };

        recognition.onresult = async (event) => {
            const recognizedInput = event.results[0][0].transcript;
            console.log('User Input:', recognizedInput);
            setUserInput(recognizedInput);
            await handleUserInput(recognizedInput);
            setIsModalOpen(false); // Close modal after getting input
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            setError('Sorry, there was an error with speech recognition.');
            resetRecording();
        };

        recognition.onend = resetRecording;
    };

    const resetRecording = () => {
        console.log('Speech recognition ended');
        setIsLoading(false);
        setIsRecording(false);
        setIsModalOpen(false); // Close modal when ended
    };

    const handleUserInput = async (input) => {
        if (!input.trim()) {
            setError('Please speak a valid input.');
            return;
        }

        setIsLoading(true);
        setError(""); 

        try {
            const res = await fetch('http://127.0.0.1:5000', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: input }),
            });
            
            if (!res.ok) throw new Error('Failed to get chatbot response');

            const data = await res.json();
            
            // Update the response with the chatbot's text
            setResponse(data.response);

            // Speak the response
            speakResponse(data.response);

        } catch (error) {
            console.error('Error fetching chatbot response:', error);
            setError("Sorry, there was an issue processing the request.");
        } finally {
            setIsLoading(false);  
        }
    };

    const speakResponse = (text) => {
        synth.cancel(); 

        const utterance = new SpeechSynthesisUtterance(text);
        
        utterance.voice = voices[selectedVoice];
        
        synth.speak(utterance);
        
        // Provide auditory feedback
        console.log('Auditory feedback: Response spoken.');
        
        // Provide visual feedback
        animateMessageSent(text);
    };

    const animateMessageSent = (text) => {
      // Placeholder for animation logic
      console.log(`Visual feedback: ${text} sent.`);
      // You can implement actual animations here using CSS or libraries.
    };

    return (
        <div id="root">
            <div className="chatbot-container">
                <h1>Voice Chatbot</h1>

                {isLoading && <p>Loading...</p>}
                {error && <p className="toast-error">{error}</p>}
                {response && <ResponseDisplay userInput={userInput} response={response} />}

                {/* Flex container for chat history */}
                <div className="chat-history">
                    {/* This div can be styled to show chat history */}
                </div>

                {/* Input section at the bottom */}
                <div className="input-container">
                    <div className={`mic-container ${isRecording ? 'listening' : ''}`} onClick={startSpeechRecognition}>
                        <FaMicrophone className="mic-icon" size={80} />
                    </div>

                    <div className="chat-input">
                        <input 
                            type="text" 
                            className="input-box" 
                            value={userInput} 
                            onChange={(e) => setUserInput(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && handleUserInput(userInput)}  
                            placeholder="Type your message..." 
                        />
                        <button className="send-button" onClick={() => handleUserInput(userInput)}>
                            <AiOutlineArrowRight size={24} />
                        </button>
                    </div>
                </div>

                {/* Button to show voices outside chatbot container */}
                <button className="show-voices-button" onClick={() => setShowVoices(!showVoices)}>
                    {showVoices ? "Hide Voices" : "Show Voices"}
                </button>

                {/* Voice List */}
                {showVoices && (
                    <div className="voice-list">
                        {voices.map((voice, index) => (
                            <div 
                                key={voice.name} 
                                className={`voice-item ${selectedVoice === index ? 'selected' : ''}`} 
                                onClick={() => setSelectedVoice(index)}
                            >
                                {voice.name} ({voice.lang})
                            </div>
                        ))}
                    </div>
                )}
                
                {/* Modal for voice input */}
                {isModalOpen && (
                    <VoiceInputModal onClose={() => setIsModalOpen(false)} />
                )}
                
            </div>
            
        </div>
    );
};

export default App;
