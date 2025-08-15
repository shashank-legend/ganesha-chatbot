# app.py
# Main backend file with Google Gemini AI integration.
# This version has an updated model name and improved error handling.

import os
import google.generativeai as genai
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Initialize the Flask application
app = Flask(__name__)

# --- AI Model Configuration ---
model = None
try:
    # Configure the Gemini API with the key from the .env file
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found. Please set it in your .env file.")
    
    genai.configure(api_key=api_key)
    
    # Create the generative model with an updated model name
    # 'gemini-1.5-flash-latest' is a current and effective model for this task.
    model = genai.GenerativeModel(
        model_name='gemini-1.5-flash-latest', # <-- UPDATED MODEL NAME
        safety_settings={
            'HARM_CATEGORY_HARASSMENT': 'BLOCK_NONE',
            'HARM_CATEGORY_HATE_SPEECH': 'BLOCK_NONE',
            'HARM_CATEGORY_SEXUALLY_EXPLICIT': 'BLOCK_NONE',
            'HARM_CATEGORY_DANGEROUS_CONTENT': 'BLOCK_NONE',
        }
    )
    print("✅ Gemini 1.5 Flash model loaded successfully.")

except Exception as e:
    # This will print the exact error to your terminal if the setup fails
    print(f"🔴 ERROR: Failed to configure AI model: {e}")

# --- Flask Routes ---

@app.route('/')
def index():
    """Renders the main chat page (index.html)."""
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    """API endpoint to handle chat messages and get AI-powered responses."""
    
    if not model:
        print("🔴 ERROR: AI Model is not available.")
        return jsonify({'reply': 'My apologies, my divine connection is facing a disturbance. The model could not be loaded.'}), 500

    user_message = request.json.get('message')
    if not user_message:
        return jsonify({'error': 'No message provided.'}), 400

    prompt = f"""
    You are Lord Ganesha, the remover of obstacles. A devotee is sharing their prayer with you. 
    Your response must be: wise, comforting, divine, in English, short (2-3 sentences), and offer a blessing or spiritual guidance. Do not ask questions.
    Devotee's prayer: "{user_message}"
    Your divine response:
    """

    try:
        response = model.generate_content(prompt)
        
        if not response.parts:
            print("🔴 WARNING: AI response was blocked. Prompt feedback:", response.prompt_feedback)
            return jsonify({'reply': "My child, your words carry deep emotion. Know that even in silence, your prayer is acknowledged. Find strength within."}), 200

        ai_response = response.text
        return jsonify({'reply': ai_response})

    except Exception as e:
        print(f"🔴 ERROR: Failed to generate content from AI: {e}")
        fallback_response = "My child, your words have reached me, but my cosmic connection is momentarily unclear. Your faith is your strength. Hold onto it."
        return jsonify({'reply': fallback_response}), 500

if __name__ == '__main__':
    app.run(debug=True)
