import React, { useState, useEffect, useRef } from 'react';
import { request, gql } from 'graphql-request';
import { createClient } from 'graphql-ws';
import { Youtube, Download, Music, Loader2, AlertCircle, CheckCircle2, Play, List, ChevronRight, X, Headphones } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const GRAPHQL_ENDPOINT = import.meta.env.VITE_GRAPHQL_ENDPOINT || `http://${window.location.hostname}:8000/graphql`;
const WS_GRAPHQL_ENDPOINT = import.meta.env.VITE_WS_GRAPHQL_ENDPOINT || `ws://${window.location.hostname}:8000/graphql`;

const METADATA_QUERY = gql`
  query GetMetadata($url: String!) {
    metadata(url: $url) {
      type
      title
      thumbnail
      url
      duration
      entries {
        id
        title
        url
        thumbnail
        duration
      }
    }
  }
`;

const START_DOWNLOAD_MUTATION = gql`
  mutation StartDownload($url: String!) {
    startDownload(url: $url) {
      jobId
      downloadUrl
    }
  }
`;

const PROGRESS_SUBSCRIPTION = `
  subscription OnProgress($jobId: String!) {
    progress(jobId: $jobId)
  }
`;

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null); // { id, title, progress, jobId, downloadUrl }
  const [selectedItems, setSelectedItems] = useState([]);

  const fetchMetadata = async (e) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError('');
    setMetadata(null);
    setSelectedItems([]);

    try {
      const data = await request(GRAPHQL_ENDPOINT, METADATA_QUERY, { url });
      setMetadata(data.metadata);
      if (data.metadata.type === 'video') {
        setSelectedItems([data.metadata.url]);
      }
    } catch (err) {
      setError(err.response?.errors?.[0]?.message || 'Failed to fetch video information. Please check the URL.');
    } finally {
      setLoading(false);
    }
  };

  const startDownload = async (itemUrl, title) => {
    setDownloading({ title, progress: 0, status: 'initializing' });
    setError('');

    try {
      const data = await request(GRAPHQL_ENDPOINT, START_DOWNLOAD_MUTATION, { url: itemUrl });
      const { jobId, downloadUrl } = data.startDownload;
      
      setDownloading(prev => ({ ...prev, jobId, status: 'downloading' }));

      // Setup GraphQL Subscription for progress
      const client = createClient({
        url: WS_GRAPHQL_ENDPOINT,
      });

      const unsubscribe = client.subscribe(
        {
          query: PROGRESS_SUBSCRIPTION,
          variables: { jobId },
        },
        {
          next: (data) => {
            const progress = data.data.progress;
            if (progress < 0) {
              setError('Conversion failed. Please try another URL.');
              setDownloading(null);
              unsubscribe();
              return;
            }
            setDownloading(prev => ({ ...prev, progress }));
            if (progress >= 100) {
              setDownloading(prev => ({ 
                ...prev, 
                status: 'completed', 
                downloadUrl: `http://${window.location.hostname}:8000${downloadUrl}` 
              }));
              unsubscribe();
            }
          },
          error: (err) => {
            console.error('Subscription error:', err);
            setError('Connection lost. Please try again.');
            setDownloading(null);
          },
          complete: () => {
            console.log('Subscription complete');
          },
        }
      );
    } catch (err) {
      setError(err.response?.errors?.[0]?.message || 'Download failed.');
      setDownloading(null);
    }
  };

  const handlePlaylistDownload = async () => {
    if (selectedItems.length === 0) return;
    // For simplicity in this demo, we download the first selected item
    // In a full app, you might loop through them or zip them
    const item = metadata.entries.find(e => e.url === selectedItems[0]);
    startDownload(item.url, item.title);
  };

  const toggleItem = (itemUrl) => {
    setSelectedItems(prev => 
      prev.includes(itemUrl) 
        ? prev.filter(u => u !== itemUrl) 
        : [...prev, itemUrl]
    );
  };

  const handleBrowserDownload = (url, filename) => {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename || 'audio.mp3');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans selection:bg-purple-100 selection:text-purple-900 overflow-x-hidden">
      {/* Decorative Elements */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-200/50 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200/50 rounded-full blur-[120px]" />
      </div>

      <nav className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 group cursor-pointer"
        >
          <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-200 group-hover:scale-110 transition-transform">
            <Music className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">AudioFlow</span>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden md:flex items-center gap-8"
        >
          <a href="#" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">Features</a>
          <a href="#" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">Pricing</a>
          <button className="px-5 py-2.5 bg-white border border-slate-200 rounded-full text-sm font-semibold shadow-sm hover:shadow-md transition-all active:scale-95">
            Sign In
          </button>
        </motion.div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-12 md:pt-20 pb-32">
        <div className="text-center mb-10 md:mb-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-slate-900 to-slate-600 leading-[1.1]"
          >
            Don't type, just speak. <br />
            <span className="text-purple-600">Save the rhythm.</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed px-4"
          >
            The world's fastest way to convert YouTube playlists into high-quality MP3s. 
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative group"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-blue-500 rounded-[2rem] blur opacity-25 group-focus-within:opacity-40 transition duration-1000"></div>
          <form onSubmit={fetchMetadata} className="relative bg-white p-2 rounded-3xl md:rounded-[1.8rem] shadow-xl border border-slate-100 flex flex-col md:flex-row items-stretch md:items-center gap-2">
            <div className="pl-4 md:pl-6 flex-1 flex items-center gap-3 py-2 md:py-0">
              <Youtube className="w-6 h-6 text-red-500 shrink-0" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste YouTube link here..."
                className="w-full py-3 md:py-4 text-base md:text-lg focus:outline-none placeholder:text-slate-400 bg-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !url}
              className="bg-slate-900 text-white px-8 py-4 rounded-2xl md:rounded-[1.4rem] font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Preview"}
              <ChevronRight className="w-5 h-5" />
            </button>
          </form>
        </motion.div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600"
            >
              <AlertCircle className="w-5 h-5" />
              <p className="font-medium">{error}</p>
            </motion.div>
          )}

          {metadata && !downloading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8 md:mt-12 bg-white/70 backdrop-blur-xl border border-white rounded-3xl md:rounded-[2.5rem] p-5 md:p-8 shadow-2xl"
            >
              <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
                <div className="w-full md:w-64 aspect-video bg-slate-100 rounded-2xl overflow-hidden shadow-inner relative group border border-slate-200">
                  <img 
                    src={metadata.thumbnail || (metadata.entries?.[0]?.thumbnail)} 
                    alt="Thumbnail" 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                    onError={(e) => e.target.src = 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png'}
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="w-12 h-12 text-white fill-current" />
                  </div>
                </div>
                
                <div className="flex-1 space-y-3 md:space-y-4 w-full">
                  <div className="flex items-center gap-2">
                    {metadata.type === 'playlist' ? <List className="w-4 h-4 text-purple-600" /> : <Play className="w-4 h-4 text-blue-600" />}
                    <span className="text-[10px] md:text-sm font-bold uppercase tracking-widest text-slate-400">
                      {metadata.type}
                    </span>
                  </div>
                  <h2 className="text-xl md:text-3xl font-bold text-slate-900 leading-tight">{metadata.title}</h2>
                  
                  {metadata.type === 'playlist' && (
                    <p className="text-sm md:text-slate-500 font-medium text-slate-400">
                      {metadata.entries.length} videos • {selectedItems.length} selected
                    </p>
                  )}

                  <div className="pt-2">
                    {metadata.type === 'video' ? (
                      <button
                        onClick={() => startDownload(metadata.url, metadata.title)}
                        className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:shadow-lg hover:shadow-purple-200 transition-all active:scale-95"
                      >
                        <Download className="w-5 h-5" />
                        Download MP3
                      </button>
                    ) : (
                      <button
                        onClick={handlePlaylistDownload}
                        disabled={selectedItems.length === 0}
                        className="w-full md:w-auto px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <Download className="w-5 h-5" />
                        Download {selectedItems.length} Selected
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {metadata.type === 'playlist' && (
                <div className="mt-8 pt-8 border-t border-slate-100">
                  <h3 className="text-lg font-bold mb-6">Select Tracks</h3>
                  <div className="flex flex-col gap-3 max-h-[300px] md:max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {metadata.entries.map((entry) => (
                      <motion.div
                        key={entry.id}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => toggleItem(entry.url)}
                        className={`p-3 md:p-4 rounded-2xl border transition-all cursor-pointer flex gap-3 md:gap-4 items-center ${
                          selectedItems.includes(entry.url)
                            ? 'bg-purple-50 border-purple-200 shadow-sm'
                            : 'bg-white border-slate-100 hover:border-slate-200 shadow-sm'
                        }`}
                      >
                        <div className={`w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                          selectedItems.includes(entry.url)
                            ? 'bg-purple-600 border-purple-600'
                            : 'border-slate-300'
                        }`}>
                          {selectedItems.includes(entry.url) && <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-white" />}
                        </div>
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                          <img 
                            src={entry.thumbnail || 'https://i.ytimg.com/vi/placeholder/mqdefault.jpg'} 
                            alt="" 
                            className="w-full h-full object-cover"
                            onError={(e) => e.target.src = 'https://www.gstatic.com/youtube/img/branding/favicon/favicon_144x144.png'}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 truncate text-xs md:text-sm">{entry.title}</p>
                          <p className="text-[10px] md:text-xs text-slate-500">
                            {entry.duration ? `${Math.floor(entry.duration / 60)}:${String(entry.duration % 60).padStart(2, '0')}` : 'YouTube Video'}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {downloading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 md:mt-12 bg-white rounded-3xl md:rounded-[2.5rem] p-5 md:p-8 shadow-2xl border border-slate-100 max-w-full overflow-hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                    {downloading.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
                    ) : (
                      <Headphones className="w-5 h-5 md:w-6 md:h-6 text-purple-600 animate-pulse" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base md:text-lg font-bold text-slate-900 truncate">{downloading.title}</h3>
                    <p className="text-slate-500 font-medium uppercase tracking-wider text-[8px] md:text-[10px]">
                      {downloading.status === 'completed' ? 'Ready to download' : 'Converting to MP3...'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setDownloading(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors shrink-0 ml-2"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              {downloading.status !== 'completed' ? (
                <div className="space-y-4">
                  <div className="h-3 md:h-4 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-purple-600 to-blue-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${downloading.progress}%` }}
                      transition={{ type: "spring", stiffness: 50 }}
                    />
                  </div>
                  <div className="flex justify-between text-xs md:text-sm font-bold text-slate-400">
                    <span>{Math.round(downloading.progress)}%</span>
                    <span>192kbps Quality</span>
                  </div>
                </div>
              ) : (
                <motion.button
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  onClick={() => handleBrowserDownload(downloading.downloadUrl, `${downloading.title}.mp3`)}
                  className="w-full py-4 md:py-5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-2xl md:rounded-[1.4rem] font-extrabold flex items-center justify-center gap-3 hover:shadow-2xl hover:shadow-purple-200 transition-all active:scale-95"
                >
                  <Download className="w-5 h-5 md:w-6 md:h-6" />
                  Save Audio to Device
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Micro-animations */}
      <motion.div 
        animate={{ y: [0, -20, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="fixed top-1/4 right-10 w-24 h-24 bg-white/40 backdrop-blur rounded-[2rem] shadow-xl border border-white hidden lg:flex items-center justify-center pointer-events-none"
      >
        <Music className="w-10 h-10 text-purple-400" />
      </motion.div>
      <motion.div 
        animate={{ y: [0, 20, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="fixed bottom-1/4 left-10 w-16 h-16 bg-white/40 backdrop-blur rounded-2xl shadow-xl border border-white hidden lg:flex items-center justify-center pointer-events-none"
      >
        <Play className="w-6 h-6 text-blue-400" />
      </motion.div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}} />
    </div>
  );
}

export default App;
