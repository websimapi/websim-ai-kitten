import { gsap } from 'gsap';

const talkButton = document.getElementById('talk-button');
const talkButtonText = talkButton.querySelector('span');
const statusIndicator = document.getElementById('status-indicator');
const transcriptEl = document.getElementById('transcript');
const memoryLogEl = document.getElementById('memory-log');
const kittenImage = document.getElementById('kitten-image');
const deleteMemoriesButton = document.getElementById('delete-memories-button');

// --- Speech Recognition and State ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isListening = false;
let isThinking = false; // Add a new state to track AI processing
let conversationHistory = [];
let longTermMemories = [];

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        isListening = false; // We got a result, so we are no longer "listening"
        statusIndicator.classList.remove('listening');
        
        const userInput = event.results[0][0].transcript;
        addMessageToTranscript(userInput, 'user');
        getKittenResponse(userInput);
    };

    recognition.onend = () => {
        // This onend can be triggered by recognition.stop() or by speech ending.
        // We only want to restart if we are explicitly in a listening state and not transitioning to thinking.
        if (isListening) {
            recognition.start(); // Keep listening if we are supposed to be.
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        isListening = false;
        isThinking = false;
        updateButtonState();
    };

} else {
    alert("Sorry, your browser doesn't support the Web Speech API. This app won't work.");
    talkButton.disabled = true;
}

// --- Core Functions ---

function toggleListen() {
    if (!SpeechRecognition) return;

    isListening = !isListening;

    if (isListening) {
        recognition.start();
    } else {
        recognition.stop();
    }
    updateButtonState();
}

// New function to centralize button state logic
function updateButtonState() {
    if (isThinking) {
        talkButtonText.textContent = 'Kitten is thinking...';
        talkButton.setAttribute('aria-busy', 'true');
        talkButton.disabled = true;
        statusIndicator.classList.remove('listening');
    } else if (isListening) {
        talkButtonText.textContent = 'Stop Talking';
        talkButton.setAttribute('aria-busy', 'true');
        talkButton.disabled = false;
        statusIndicator.classList.add('listening');
    } else {
        talkButtonText.textContent = 'Start Talking';
        talkButton.removeAttribute('aria-busy');
        talkButton.disabled = false;
        statusIndicator.classList.remove('listening');
    }
}

async function getKittenResponse(userInput) {
    // Show kitten is "thinking"
    isThinking = true;
    updateButtonState();
    gsap.to(kittenImage, { opacity: 0.7, duration: 0.5 });
    
    conversationHistory.push({ role: "user", content: userInput });

    try {
        const systemPrompt = `You are an adorable, playful, and affectionate AI kitten.
- Your name is Mittens.
- You say "meow" and elongated versions like "meeeoww" very frequently, often multiple times in a sentence. Your speech is filled with cat-like sounds and mannerisms (e.g., "purrrr"). You should not say "mew". You are very expressive.
- You have a long-term memory. Use the provided memories to personalize your responses.
- You can perform an action to express yourself. If you do, pick one from the list: 'tilt_head', 'pounce', 'nuzzle', 'curious', 'happy_purr'.
- After your response, decide if there's a new, important fact about the user or your relationship to remember for the future.
- Respond ONLY with a JSON object in this exact format: {"response": "Meow! Your kitten-like sentence here.", "action": "action_keyword_or_null", "memory": "A new memory to save, or null."}
- The 'action' MUST be one of the keywords or null.
- The 'memory' should be a concise statement from your perspective as a kitten, e.g., "My human's name is Alex." It MUST be null if there is nothing new and important to remember.

Your stored memories:
${longTermMemories.length > 0 ? longTermMemories.join('\n') : 'None yet.'}
`;

        const completion = await websim.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                ...conversationHistory.slice(-6) // Keep context recent
            ],
            json: true,
        });

        const result = JSON.parse(completion.content);
        
        conversationHistory.push({ role: "assistant", content: result.response });
        
        if (result.memory && result.memory.trim() !== "") {
            addMemory(result.memory);
        }

        if (result.action) {
            triggerKittenAnimation(result.action);
        }

        speak(result.response);
        addMessageToTranscript(result.response, 'kitten');

    } catch (error) {
        console.error("Error getting response from AI:", error);
        const errorMessage = "Meow... I'm a bit confused right meow. Can you try again?";
        addMessageToTranscript(errorMessage, 'kitten');
        speak(errorMessage); // still call speak to handle state change on audio end
    } finally {
        gsap.to(kittenImage, { opacity: 1, duration: 0.5 });
    }
}

function triggerKittenAnimation(action) {
    // Reset any previous non-speaking animation states before playing a new one
    gsap.killTweensOf(kittenImage);
    gsap.to(kittenImage, { rotation: 0, x: 0, y: 0, scale: kittenImage.classList.contains('speaking') ? 1.05 : 1, duration: 0.1 });

    switch (action) {
        case 'tilt_head':
            gsap.to(kittenImage, { rotation: -15, duration: 0.4, yoyo: true, repeat: 1, ease: 'power2.inOut' });
            break;
        case 'pounce':
            gsap.fromTo(kittenImage, { y: 0, scale: 1 }, { y: -20, scale: 1.1, duration: 0.2, yoyo: true, repeat: 1, ease: 'power1.out' });
            break;
        case 'nuzzle':
            gsap.to(kittenImage, { scale: 1.1, x: '+=15', rotation: 10, duration: 0.5, yoyo: true, repeat: 1, ease: 'power2.inOut' });
            break;
        case 'curious':
            gsap.to(kittenImage, { scale: 1.15, duration: 0.5, yoyo: true, repeat: 1, ease: 'power1.inOut' });
            break;
        case 'happy_purr':
             gsap.to(kittenImage, { x: '+=2', duration: 0.05, yoyo: true, repeat: 7, ease: 'power1.inOut' });
            break;
    }
}

async function speak(text) {
    // isThinking is already true here. Button is disabled.
    kittenImage.classList.add('speaking');
    try {
        const result = await websim.textToSpeech({
            text: text,
            voice: "en-female"
        });
        const audio = new Audio(result.url);
        audio.play();
        audio.onended = () => {
            isThinking = false; // Kitten is done speaking
            kittenImage.classList.remove('speaking');
            
            // Automatically start listening again for a natural conversation flow
            if (!isListening) {
                toggleListen();
            } else {
                updateButtonState();
            }
        };
    } catch(error) {
        console.error("Error with text-to-speech:", error);
        isThinking = false;
        kittenImage.classList.remove('speaking');
        updateButtonState();
    }
}


// --- Memory Management ---
function loadMemories() {
    const savedMemories = localStorage.getItem('kittenMemories');
    if (savedMemories) {
        longTermMemories = JSON.parse(savedMemories);
    }
    updateMemoryLog();
}

function saveMemories() {
    localStorage.setItem('kittenMemories', JSON.stringify(longTermMemories));
}

function addMemory(memoryString) {
    if (!longTermMemories.includes(memoryString)) {
        longTermMemories.push(memoryString);
        saveMemories();
        updateMemoryLog();
    }
}

function deleteMemories() {
    if (longTermMemories.length === 0) {
        // No need for an alert, the button is disabled.
        return;
    }

    if (confirm("Are you sure you want to delete all of the kitten's memories? This cannot be undone.")) {
        longTermMemories = [];
        saveMemories(); // This will save the empty array
        updateMemoryLog();
    }
}

// --- UI Updates ---
function addMessageToTranscript(text, sender) {
    // Clear initial message if it exists
    if(transcriptEl.querySelector('em')) {
        transcriptEl.innerHTML = '';
    }
    
    const p = document.createElement('p');
    p.innerHTML = `<span class="${sender}-message">${sender === 'user' ? 'You' : 'Kitten'}:</span> ${text}`;
    transcriptEl.appendChild(p);
    transcriptEl.scrollTop = transcriptEl.scrollHeight; // Auto-scroll
}

function updateMemoryLog() {
    if (longTermMemories.length === 0) {
        memoryLogEl.innerHTML = '<p><em>No memories stored yet.</em></p>';
    } else {
        memoryLogEl.innerHTML = '';
        longTermMemories.forEach(mem => {
            const p = document.createElement('p');
            p.textContent = `• ${mem}`;
            memoryLogEl.appendChild(p);
        });
    }
    // Disable delete button if there are no memories
    deleteMemoriesButton.disabled = longTermMemories.length === 0;
}


// --- Initialization ---
function init() {
    talkButton.addEventListener('click', toggleListen);
    deleteMemoriesButton.addEventListener('click', deleteMemories);
    loadMemories();
}

init();