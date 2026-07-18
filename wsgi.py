"""WSGI entry point for the SayIt server.

For PythonAnywhere deployment, you can configure the Web App to import `application` from this file.
"""

import os
from dotenv import load_dotenv

# Load environment variables from .env file if it exists (useful for local testing)
dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(dotenv_path):
    load_dotenv(dotenv_path)

from server.app import create_app

application = create_app()

if __name__ == "__main__":
    application.run()
