// script.js
// Handles all frontend interactivity for the chat application.

document.addEventListener('DOMContentLoaded', () => {
    // Get references to all the necessary HTML elements
    const prayerForm = document.getElementById('prayer-form');
    const prayerInput = document.getElementById('prayer-input');
    const chatWindow = document.getElementById('chat-window');
    const sendButton = document.getElementById('send-btn');
    
    const audio = document.getElementById('chant-audio');
    const audioToggleButton = document.getElementById('audio-toggle');
    const volumeIcon = document.getElementById('volume-icon');
    const muteIcon = document.getElementById('mute-icon');

    // --- Audio Functionality ---
    let isAudioStarted = false;

    // Set initial volume to 50%
    audio.volume = 0.5;

    // Function to attempt playing the audio
    function startAudio() {
        if (isAudioStarted) return;
        // The play() method returns a Promise. We can use it to see if autoplay was successful.
        audio.play().then(() => {
            isAudioStarted = true;
            console.log("Audio started successfully.");
        }).catch(error => {
            // Autoplay was prevented. The user needs to interact with the page first.
            console.log("Autoplay prevented:", error);
        });
    }

    // Add a one-time event listener to the whole document to start audio on the first click
    document.body.addEventListener('click', startAudio, { once: true });
    // Also listen for the first form submission as an interaction
    prayerForm.addEventListener('submit', startAudio, { once: true });

    // Toggle mute/unmute when the audio button is clicked
    audioToggleButton.addEventListener('click', () => {
        audio.muted = !audio.muted;
        volumeIcon.classList.toggle('hidden', audio.muted);
        muteIcon.classList.toggle('hidden', !audio.muted);
    });

    // --- Chat Functionality ---

    // Listen for the form submission event
    prayerForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Prevent the default form submission (page reload)

        const userMessage = prayerInput.value.trim(); // Get the user's message
        if (userMessage === '') return; // Don't send empty messages

        // Display the user's message in the chat window
        appendMessage(userMessage, 'user');

        // Clear the input field and disable the send button while waiting for a response
        prayerInput.value = '';
        sendButton.disabled = true;

        try {
            // Send the message to the Flask backend API
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: userMessage }),
            });

            if (!response.ok) {
                throw new Error('Network response was not ok');
            }

            const data = await response.json();
            const botReply = data.reply;

            // Display the bot's reply in the chat window
            appendMessage(botReply, 'bot');

        } catch (error) {
            console.error('Error:', error);
            // Display an error message if the backend fails
            appendMessage('Sorry, a blessing could not be delivered at this moment. Please try again.', 'bot');
        } finally {
            // Re-enable the send button after getting a response or an error
            sendButton.disabled = false;
        }
    });

    /**
     * Creates and appends a new message bubble to the chat window.
     * @param {string} text - The message text to display.
     * @param {string} sender - 'user' or 'bot' to determine the styling.
     */
    function appendMessage(text, sender) {
        const messageWrapper = document.createElement('div');
        const messageElement = document.createElement('div');
        
        // Common styling for the message bubble
        messageElement.classList.add('bg-white', 'rounded-xl', 'p-3', 'shadow-sm', 'max-w-md');
        
        // Differentiate styling and alignment for user vs. bot
        if (sender === 'user') {
            messageWrapper.classList.add('message', 'user-message', 'flex', 'justify-end', 'mb-4');
            messageElement.classList.add('bg-orange-100');
            messageElement.innerHTML = `<p>${text}</p>`;
        } else {
            messageWrapper.classList.add('message', 'bot-message', 'flex', 'justify-start', 'mb-4');
            messageElement.innerHTML = `<p class="font-bold text-orange-600">Ganesha</p><p>${text}</p>`;
        }

        messageWrapper.appendChild(messageElement);
        chatWindow.appendChild(messageWrapper);

        // Automatically scroll to the latest message
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }


});
