"""Development entry point: ``python run.py``.

For production use a WSGI server instead, e.g. ``gunicorn "ganesha:create_app()"``.
"""
import os

from ganesha import create_app

app = create_app()

if __name__ == "__main__":
    app.run(
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "5050")),  # 5000 is taken by AirPlay on macOS
        debug=os.getenv("FLASK_DEBUG", "0") == "1",
    )
