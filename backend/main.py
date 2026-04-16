from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import yt_dlp
import os
import uuid
import shutil
import asyncio
import re
import strawberry
from strawberry.fastapi import GraphQLRouter
from typing import List, Optional, AsyncGenerator

# Ensure node is in PATH for yt-dlp's signature decryption
node_path = shutil.which("node")
if node_path:
    os.environ["PATH"] = os.path.dirname(node_path) + os.pathsep + os.environ.get("PATH", "")

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOAD_DIR = "downloads"
if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)

# Store progress and metadata for each job_id
job_progress = {}
job_info = {}

class MyLogger:
    def debug(self, msg):
        if msg.startswith('[debug] '):
            pass
        else:
            self.info(msg)
    def info(self, msg):
        print(f"INFO: {msg}")
    def warning(self, msg):
        print(f"WARNING: {msg}")
    def error(self, msg):
        print(f"ERROR: {msg}")

def progress_hook(d, job_id):
    if d['status'] == 'downloading':
        # More robust progress calculation
        downloaded = d.get('downloaded_bytes', 0)
        total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
        if total > 0:
            # Keep it at 99% max while downloading
            # to leave room for post-processing
            progress = (downloaded / total) * 99
            job_progress[job_id] = progress
        else:
            # Fallback to percent string parsing if bytes are missing
            p = d.get('_percent_str', '0%')
            p = re.sub(r'\x1b\[[0-9;]*m', '', p) # Remove ANSI codes
            p = p.replace('%','').strip()
            try:
                job_progress[job_id] = float(p) * 0.99
            except:
                pass
    elif d['status'] == 'finished':
        # Don't set to 100 yet; wait for post-processing
        print(f"Download finished for job {job_id}, starting post-processing...")
        job_progress[job_id] = 99.5

async def run_conversion(url: str, job_id: str, job_dir: str):
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': os.path.join(job_dir, '%(title)s.%(ext)s'),
        'quiet': False, # Set to False for better debugging
        'no_warnings': False,
        'progress_hooks': [lambda d: progress_hook(d, job_id)],
        'logger': MyLogger(),
        'nocheckcertificate': True,
        'geo_bypass': True,
        'prefer_ffmpeg': True,
        'noplaylist': True, # Ensure we only download the specific video
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
    }

    try:
        loop = asyncio.get_event_loop()
        def run_ydl():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(url, download=True)
        
        info = await loop.run_in_executor(None, run_ydl)
        job_info[job_id] = info.get("title", "audio")
        job_progress[job_id] = 100
    except Exception as e:
        print(f"Error in job {job_id}: {e}")
        job_progress[job_id] = -1 # Indicate error
        shutil.rmtree(job_dir, ignore_errors=True)

@strawberry.type
class VideoEntry:
    id: str
    title: str
    url: str
    thumbnail: Optional[str]
    duration: Optional[int]

@strawberry.type
class Metadata:
    type: str
    title: str
    thumbnail: Optional[str]
    url: Optional[str] = None
    duration: Optional[int] = None
    entries: Optional[List[VideoEntry]] = None

@strawberry.type
class DownloadResponse:
    job_id: str
    download_url: str

@strawberry.type
class Query:
    @strawberry.field
    async def metadata(self, url: str) -> Metadata:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'noplaylist': False,
        }
        
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                
                if 'entries' not in info and 'list=' in url:
                    info = ydl.extract_info(url, download=False, process=False)

                if 'entries' in info:
                    entries = []
                    raw_entries = list(info['entries']) if hasattr(info['entries'], '__iter__') else []
                    
                    for entry in raw_entries:
                        if not entry: continue
                        entry_id = entry.get("id")
                        thumbnail = entry.get("thumbnail")
                        if not thumbnail and entry_id: 
                            thumbnail = f"https://i.ytimg.com/vi/{entry_id}/mqdefault.jpg"
                        
                        entries.append(VideoEntry(
                            id=entry_id,
                            title=entry.get("title") or "Unknown Title",
                            url=f"https://www.youtube.com/watch?v={entry_id}",
                            thumbnail=thumbnail,
                            duration=entry.get("duration")
                        ))
                    
                    return Metadata(
                        type="playlist",
                        title=info.get("title") or "YouTube Mix / Playlist",
                        thumbnail=info.get("thumbnail") or (entries[0].thumbnail if entries else None),
                        entries=entries
                    )
                else:
                    return Metadata(
                        type="video",
                        title=info.get("title"),
                        thumbnail=info.get("thumbnail"),
                        duration=info.get("duration"),
                        url=url
                    )
        except Exception as e:
            # Fallback
            try:
                with yt_dlp.YoutubeDL({'quiet': True, 'noplaylist': True}) as ydl:
                    info = ydl.extract_info(url, download=False)
                    return Metadata(
                        type="video",
                        title=info.get("title"),
                        thumbnail=info.get("thumbnail"),
                        duration=info.get("duration"),
                        url=url
                    )
            except:
                raise Exception(str(e))

@strawberry.type
class Mutation:
    @strawberry.mutation
    async def start_download(self, url: str, info: strawberry.Info) -> DownloadResponse:
        background_tasks: BackgroundTasks = info.context["background_tasks"]
        job_id = str(uuid.uuid4())
        job_dir = os.path.join(DOWNLOAD_DIR, job_id)
        os.makedirs(job_dir)
        
        job_progress[job_id] = 0
        background_tasks.add_task(run_conversion, url, job_id, job_dir)

        return DownloadResponse(
            job_id=job_id,
            download_url=f"/file/{job_id}"
        )

@strawberry.type
class Subscription:
    @strawberry.subscription
    async def progress(self, job_id: str) -> AsyncGenerator[float, None]:
        try:
            while True:
                if job_id in job_progress:
                    progress = job_progress[job_id]
                    yield progress
                    if progress >= 100 or progress < 0:
                        break
                await asyncio.sleep(0.5)
        finally:
            # Delay cleanup slightly
            await asyncio.sleep(2)
            if job_id in job_progress:
                del job_progress[job_id]

schema = strawberry.Schema(Query, Mutation, Subscription)

async def get_context(background_tasks: BackgroundTasks):
    return {"background_tasks": background_tasks}

graphql_app = GraphQLRouter(schema, context_getter=get_context)
app.include_router(graphql_app, prefix="/graphql")

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/file/{job_id}")
async def get_file(job_id: str):
    job_dir = os.path.join(DOWNLOAD_DIR, job_id)
    if not os.path.exists(job_dir):
        raise HTTPException(status_code=404, detail="File not found")
    
    files = os.listdir(job_dir)
    if not files:
        raise HTTPException(status_code=404, detail="File not found")
    
    mp3_file = next((f for f in files if f.endswith(".mp3")), None)
    if not mp3_file:
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    file_path = os.path.join(job_dir, mp3_file)
    
    return FileResponse(
        file_path, 
        media_type="audio/mpeg", 
        filename=mp3_file,
        headers={
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
