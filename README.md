# YouTube to MP3 Converter (AudioFlow)

A modern, mobile-friendly web application to convert YouTube videos and playlists into high-quality MP3s.

## Features

- **Single Video Conversion**: Paste a link to any YouTube video and download it as an MP3.
- **Playlist Support**: Preview all videos in a playlist and select which ones to convert.
- **Real-time Progress**: Track the conversion progress via GraphQL subscriptions.
- **Mobile Friendly**: Fully responsive design for a great experience on any device.
- **GraphQL API**: Powered by a robust GraphQL API for efficient data fetching.

## Tech Stack

### Backend
- **FastAPI**: High-performance web framework for Python.
- **Strawberry GraphQL**: Modern GraphQL library for Python.
- **yt-dlp**: Powerful command-line program to download videos from YouTube.
- **FFmpeg**: Multimedia framework for audio conversion.

### Frontend
- **React**: Popular JavaScript library for building user interfaces.
- **Vite**: Next-generation frontend tooling.
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development.
- **Framer Motion**: Production-ready motion library for React.
- **Lucide React**: Beautifully simple pixel-perfect icons.
- **GraphQL Request**: Minimalist GraphQL client for JavaScript.

## Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- FFmpeg installed and in your system PATH.

### Backend Setup
1. Navigate to the `backend` directory.
2. Create a virtual environment: `python -m venv venv`.
3. Activate the virtual environment: `source venv/bin/activate` (or `venv\Scripts\activate` on Windows).
4. Install dependencies: `pip install -r requirements.txt`. (Note: You may need to create this file based on the installed packages).
5. Run the server: `python main.py`.

### Frontend Setup
1. Navigate to the `frontend` directory.
2. Install dependencies: `npm install`.
3. Create a `.env` file with your backend URL:
   ```env
   VITE_GRAPHQL_ENDPOINT=http://localhost:8000/graphql
   VITE_WS_GRAPHQL_ENDPOINT=ws://localhost:8000/graphql
   ```
4. Start the development server: `npm run dev`.

## License
MIT
