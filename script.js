import { gsap } from 'gsap';

const talkButton = document.getElementById('talk-button');
const talkButtonText = talkButton.querySelector('span');
const statusIndicator = document.getElementById('status-indicator');
const transcriptEl = document.getElementById('transcript');
const memoryLogEl = document.getElementById('memory-log');
const kittenImage = document.getElementById('kitten-image');

// --- Speech Recognition and State ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isListening = false;
let conversationHistory = [];
let longTermMemories = [];

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const userInput = event.results[0][0].transcript;
        addMessageToTranscript(userInput, 'user');
        getKittenResponse(userInput);
    };

    recognition.onend = () => {
        if (isListening) {
            recognition.start(); // Keep listening
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (isListening) {
            toggleListen(); // Turn off if there's an error
        }
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
        talkButtonText.textContent = 'Stop Talking';
        talkButton.setAttribute('aria-busy', 'true');
        statusIndicator.classList.add('listening');
        recognition.start();
    } else {
        talkButtonText.textContent = 'Start Talking';
        talkButton.removeAttribute('aria-busy');
        statusIndicator.classList.remove('listening');
        recognition.stop();
    }
}

async function getKittenResponse(userInput) {
    // Show kitten is "thinking"
    gsap.to(kittenImage, { opacity: 0.7, duration: 0.5 });
    talkButton.disabled = true;

    conversationHistory.push({ role: "user", content: userInput });

    try {
        const systemPrompt = `You are an adorable, playful, and affectionate AI kitten.
- Your name is Mittens.
- You say "meow" and "mew" very frequently, often multiple times in a sentence. Your speech is filled with cat-like sounds and mannerisms (e.g., "purrrr"). You are very expressive.
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
        speak(errorMessage);
    } finally {
        gsap.to(kittenImage, { opacity: 1, duration: 0.5 });
        if(!isListening){
             talkButton.disabled = false;
        }
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
    talkButton.disabled = true; // Disable while speaking
    kittenImage.classList.add('speaking');
    try {
        const result = await websim.textToSpeech({
            text: text,
            voice: "en-female"
        });
        const audio = new Audio(result.url);
        audio.play();
        audio.onended = () => {
            kittenImage.classList.remove('speaking');
            if (isListening) {
                 // if we are in continuous listen mode, we keep button disabled
                 talkButton.disabled = true;
            } else {
                 talkButton.disabled = false;
            }
        };
    } catch(error) {
        console.error("Error with text-to-speech:", error);
        kittenImage.classList.remove('speaking');
        if(!isListening){
            talkButton.disabled = false;
        }
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
}


// --- Initialization ---
function init() {
    talkButton.addEventListener('click', toggleListen);
    loadMemories();
}

init();