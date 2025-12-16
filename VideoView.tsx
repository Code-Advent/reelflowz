import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Video } from '../types';
import { VideoPlayer } from '../components/VideoPlayer';
import { useParams, useNavigate } from 'react-router-dom';

export const VideoView = () => {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const [video, setVideo] = useState<Video | null>(null);

  useEffect(() => {
    if (videoId) fetchVideo(videoId);
  }, [videoId]);

  const fetchVideo = async (id: string) => {
    const { data } = await supabase
        .from('videos')
        .select('*, profiles:user_id(*)')
        .eq('id', id)
        .single();
    if (data) setVideo(data);
  };

  const handleProfileClick = (userId: string) => {
    navigate(`/profile/${userId}`);
  };

  if (!video) return <div className="h-screen bg-black flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="h-screen w-full bg-black relative">
      <button onClick={() => navigate('/')} className="absolute top-4 left-4 z-50 text-white bg-black/50 p-2 rounded-full">
          <i className="fas fa-arrow-left"></i>
      </button>
      <VideoPlayer 
        video={video} 
        isActive={true}
        onProfileClick={handleProfileClick}
        onDelete={() => navigate('/')}
      />
    </div>
  );
};