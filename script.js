import { gsap } from 'gsap';
import { createIcons, Trash2 } from 'lucide';

const talkButton = document.getElementById('talk-button');
const talkButtonText = talkButton.querySelector('span');
const statusIndicator = document.getElementById('status-indicator');
const transcriptEl = document.getElementById('transcript');
const memoryLogEl = document.getElementById('memory-log');
const kittenImage = document.getElementById('kitten-image');
const deleteMemoriesButton = document.getElementById('delete-memories-button');

let recognition;
let isListening = false;
let isThinking = false;
let userManuallyStopped = false;
let conversationHistory = [];
let longTermMemories = [];
let currentAudio = null; // To hold the current playing audio
let thinkingRequestCancelled = false; // To cancel a pending AI response

// --- Speech Recognition ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
        isListening = true;
        userManuallyStopped = false;
        updateButtonState();
    };

    recognition.onresult = (event) => {
        if (userManuallyStopped) {
            console.log("Recognition result ignored due to manual stop.");
            return;
        }

        // We got a result, so we are no longer "listening" for this utterance
        isListening = false; 
        updateButtonState(); // Show "thinking" state immediately
        
        const userInput = event.results[0][0].transcript;
        addMessageToTranscript(userInput, 'user');
        getKittenResponse(userInput);
    };

    recognition.onend = () => {
        isListening = false;
        // Don't change state if we are now thinking.
        // updateButtonState will be handled by getKittenResponse or handleTalkButtonClick
        if (!isThinking) {
             updateButtonState();
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        isListening = false;
        isThinking = false;
        userManuallyStopped = false;
        updateButtonState();
    };

} else {
    alert("Sorry, your browser doesn't support the Web Speech API. This app won't work.");
    talkButton.disabled = true;
}

// --- Core Functions ---

function handleTalkButtonClick() {
    if (!SpeechRecognition) return;

    if (isThinking) {
        // This is now a "Stop Kitten" button
        console.log('Stopping kitten...');
        thinkingRequestCancelled = true; // Flag to cancel any in-flight request
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }
        isThinking = false;
        kittenImage.classList.remove('speaking');
        gsap.to(kittenImage, { opacity: 1, duration: 0.3 });
        updateButtonState();
    } else if (isListening) {
        // This is a "Stop Talking" button
        console.log('Stopping listening...');
        userManuallyStopped = true;
        recognition.stop();
        isListening = false;
        updateButtonState();
    } else {
        // This is a "Start Talking" button
        console.log('Starting listening...');
        userManuallyStopped = false;
        recognition.start();
    }
}

function updateButtonState() {
    if (isThinking) {
        talkButtonText.textContent = 'Stop Kitten';
        talkButton.disabled = false;
        talkButton.removeAttribute('aria-busy');
        statusIndicator.classList.remove('listening');
    } else if (isListening) {
        talkButtonText.textContent = 'Stop Talking';
        talkButton.disabled = false;
        talkButton.setAttribute('aria-busy', 'true');
        statusIndicator.classList.add('listening');
    } else {
        talkButtonText.textContent = 'Start Talking';
        talkButton.disabled = false;
        talkButton.removeAttribute('aria-busy');
        statusIndicator.classList.remove('listening');
    }
}

async function getKittenResponse(userInput) {
    isThinking = true;
    thinkingRequestCancelled = false; // Reset cancellation flag for this new request
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

        if (thinkingRequestCancelled) {
            console.log("AI response cancelled by user.");
            // State is already reset by handleTalkButtonClick, so just exit.
            return;
        }

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
        if (!thinkingRequestCancelled) {
            const errorMessage = "Meow... I'm a bit confused right meow. Can you try again?";
            addMessageToTranscript(errorMessage, 'kitten');
            speak(errorMessage); // still call speak to handle state change on audio end
        }
    } finally {
        if (!thinkingRequestCancelled) {
            gsap.to(kittenImage, { opacity: 1, duration: 0.5 });
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
    // isThinking is already true here.
    kittenImage.classList.add('speaking');
    try {
        const result = await websim.textToSpeech({
            text: text,
            voice: "en-female"
        });

        if (thinkingRequestCancelled) {
            console.log("TTS generation cancelled by user.");
            return;
        }

        const audio = new Audio(result.url);
        currentAudio = audio; // Store reference to the audio object

        audio.play();

        audio.onended = () => {
            currentAudio = null; // Clear reference
            if (!thinkingRequestCancelled) {
                 isThinking = false;
                 kittenImage.classList.remove('speaking');
                 updateButtonState();
            }
        };
    } catch(error) {
        console.error("Error with text-to-speech:", error);
        currentAudio = null;
        if (!thinkingRequestCancelled) {
            isThinking = false;
            kittenImage.classList.remove('speaking');
            updateButtonState();
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

// --- NEW --- Delete a single memory
function deleteSingleMemory(index) {
    if (index >= 0 && index < longTermMemories.length) {
        longTermMemories.splice(index, 1);
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
        longTermMemories.forEach((mem, index) => {
            const memoryItem = document.createElement('div');
            memoryItem.className = 'memory-item';

            const p = document.createElement('p');
            p.textContent = `• ${mem}`;

            const deleteBtn = document.createElement('button');
            deleteBtn.setAttribute('aria-label', `Delete memory: ${mem}`);
            deleteBtn.innerHTML = `<i data-lucide="trash-2" class="lucide-icon"></i>`;
            deleteBtn.onclick = () => deleteSingleMemory(index);

            memoryItem.appendChild(p);
            memoryItem.appendChild(deleteBtn);
            memoryLogEl.appendChild(memoryItem);
        });
        // Create icons after they are added to the DOM
        createIcons({
            icons: { Trash2 },
            attrs: { 'stroke-width': 1.5, width: '18px', height: '18px' }
        });
    }
    // Disable delete button if there are no memories
    deleteMemoriesButton.disabled = longTermMemories.length === 0;
}

// --- Initialization ---
function init() {
    talkButton.addEventListener('click', handleTalkButtonClick);
    deleteMemoriesButton.addEventListener('click', deleteMemories);
    loadMemories();
    updateButtonState(); // Set initial button state
}

init();