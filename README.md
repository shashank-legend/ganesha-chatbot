🙏 Ganesha's Blessings AI Chatbot 🙏
A web-based AI chatbot for the festival of Ganesh Chaturthi where users can share their prayers and worries, receiving comforting, spiritual, and festival-themed replies from an AI modeled after Lord Ganesha.

✨ Features
AI-Powered Chat: Leverages the Google Gemini API to generate unique, wise, and comforting responses in the persona of Lord Ganesha.

Festive User Interface: A simple, elegant, and responsive UI with a warm, festival-themed color palette.

Chat Interface: Includes a clean conversation display and a user-friendly input form.

Immersive Audio: Features an optional background chant (ganesh-chant.mp3) with a mute/unmute control to enhance the spiritual experience.

Full-Stack Application: Built with a Flask backend and a vanilla HTML, CSS, and JavaScript frontend.

🛠️ Tech Stack
Frontend: HTML, Tailwind CSS, JavaScript

Backend: Python, Flask

AI: Google Gemini API (gemini-1.5-flash-latest)

📂 Project Structure
ganesh-chaturthi-app/
├── .env                  # Stores the API key (must be created manually)
├── app.py                # Main Flask application logic
├── requirements.txt      # Python dependencies
├── README.md             # Project documentation
├── static/
│   ├── ganesh-chant.mp3  # Background audio file (must be added manually)
│   ├── script.js         # Frontend JavaScript for chat and audio logic
│   └── style.css         # Custom CSS (fonts, scrollbar)
└── templates/
    └── index.html        # Main HTML file for the user interface

🚀 Setup and Installation
Follow these steps to get the application running on your local machine.

1. Clone the Repository
git clone https://github.com/your-username/ganesh-chaturthi-app.git
cd ganesh-chaturthi-app

2. Create a Python Virtual Environment
It's highly recommended to use a virtual environment to manage project dependencies.

On macOS/Linux:

python3 -m venv venv
source venv/bin/activate

On Windows:

python -m venv venv
.\venv\Scripts\activate

3. Install Dependencies
Install all the required Python packages using pip.

pip install -r requirements.txt

4. Get Your API Key
This project requires a Google Gemini API key.

Go to Google AI Studio.

Sign in and click "Get API key" > "Create API key in new project".

Copy the generated key.

5. Set Up Environment Variables
In the root of the project directory, create a new file named .env.

Open the .env file and add your API key in the following format:

GEMINI_API_KEY="PASTE_YOUR_API_KEY_HERE"

6. Add the Audio File
Obtain an .mp3 file of a Ganesh chant.

Rename it to ganesh-chant.mp3.

Place this file inside the static/ directory.

7. Run the Application
Execute the app.py script to start the Flask development server.

python app.py

The server will start, and you'll see output in your terminal, including:
* Running on http://127.0.0.1:5000

💬 How to Use
Open your web browser and navigate to http://127.0.0.1:5000.

The chat interface will load with a welcome message from Ganesha.

Click anywhere on the page to start the background audio chant. You can mute/unmute it using the volume button.

Type your prayer or message into the input box at the bottom and click the send button.

Receive a unique, AI-generated blessing in response.

☁️ Deployment
This app is structured for easy deployment on platforms like Render, Railway, or Heroku.

Procfile: For Heroku, you would need to create a Procfile with the line:
web: gunicorn app:app

Environment Variables: Instead of a .env file, you will need to set the GEMINI_API_KEY in your hosting provider's secrets/environment variable settings.

Dependencies: Ensure gunicorn is added to your requirements.txt for production deployment.

🤝 Contributing
This project was created for hackathons and learning purposes. Contributions, issues, and feature requests are welcome! Feel free to fork the repository and submit a pull request.