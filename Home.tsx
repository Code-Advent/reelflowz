import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Video } from '../types';
import { VideoPlayer } from '../components/VideoPlayer';
import { useNavigate } from 'react-router-dom';

export const Home = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchVideos();
  }, []);

  const fetchVideos = async () => {
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('*, profiles:user_id(*)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (data) {
          // Deduplicate videos by ID
          const uniqueVideos = Array.from(new Map(data.map((v: any) => [v.id, v])).values()) as Video[];
          setVideos(uniqueVideos);
      }
    } catch (e: any) {
      console.error("Error fetching videos");
    }
  };

  useEffect(() => {
    const options = {
      root: containerRef.current,
      threshold: 0.6,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const index = Number(entry.target.getAttribute('data-index'));
          setCurrentVideoIndex(index);
        }
      });
    }, options);

    const elements = document.querySelectorAll('.video-card');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [videos]);

  const handleProfileClick = (userId: string) => {
    navigate(`/profile/${userId}`);
  };

  const handleVideoDelete = (deletedId: string) => {
      setVideos(prev => prev.filter(v => v.id !== deletedId));
  };

  return (
    <div className="h-screen w-full bg-black relative">
      <div className="absolute top-4 left-0 w-full z-30 flex justify-center gap-4 text-white font-bold text-shadow pointer-events-none">
        <span className="text-gray-400 opacity-80">Following</span>
        <span className="relative after:content-[''] after:absolute after:-bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-4 after:h-1 after:bg-white after:rounded-full drop-shadow-md">For You</span>
      </div>

      <div 
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
      >
        {videos.map((video, index) => (
          <div key={video.id} data-index={index} className="h-full w-full snap-start video-card">
            <VideoPlayer 
              video={video} 
              isActive={currentVideoIndex === index}
              onProfileClick={handleProfileClick}
              onDelete={handleVideoDelete}
            />
          </div>
        ))}
        
        {videos.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 p-4 text-center">
            <i className="fas fa-film text-4xl mb-2 opacity-50"></i>
            <p>No videos available yet.</p>
            <p className="text-xs text-gray-600">If you just set up the app, try uploading a video or ensure the database tables are created.</p>
            <button onClick={fetchVideos} className="px-4 py-2 bg-gray-900 rounded-full text-xs text-white mt-2">Retry</button>
          </div>
        )}
      </div>
    </div>
  );
};