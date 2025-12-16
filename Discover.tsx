import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Profile } from '../types';
import { formatNumber } from '../utils';
import { useNavigate } from 'react-router-dom';

export const Discover = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [trendingVideos, setTrendingVideos] = useState<Video[]>([]);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDiscoveryContent();
  }, []);

  useEffect(() => {
      if (searchTerm.length > 1) {
          searchUsers();
      } else {
          setSearchResults([]);
      }
  }, [searchTerm]);

  const fetchDiscoveryContent = async () => {
    // Show videos that reached 2k views as "Trending New Creators"
    const { data } = await supabase
      .from('videos')
      .select('*, profiles:user_id(*)')
      .gte('views_count', 2000)
      .order('views_count', { ascending: false })
      .limit(20);
    
    if (data && data.length > 0) {
        setTrendingVideos(data);
    } else {
        // Fallback if no videos reached 2k yet, show top viewed anyway
        const { data: fallback } = await supabase
          .from('videos')
          .select('*, profiles:user_id(*)')
          .order('views_count', { ascending: false })
          .limit(20);
        if (fallback) setTrendingVideos(fallback);
    }
  };

  const searchUsers = async () => {
    const { data } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${searchTerm}%`)
        .limit(10);
    
    if (data) setSearchResults(data);
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20 pt-4 px-4">
      <div className="sticky top-0 bg-black z-10 pb-4">
        <div className="flex gap-2 mb-2">
            <div className="flex-1 bg-gray-800 rounded-md flex items-center px-3">
                <i className="fas fa-search text-gray-400"></i>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search users..."
                    className="w-full bg-transparent p-2 focus:outline-none"
                />
            </div>
            {searchTerm && <button onClick={() => setSearchTerm('')} className="text-gray-400">Cancel</button>}
        </div>
      </div>

      {searchResults.length > 0 ? (
          <div className="flex flex-col gap-4">
              <h3 className="text-gray-400 text-sm font-bold">People</h3>
              {searchResults.map(user => (
                  <div key={user.id} onClick={() => navigate(`/profile/${user.id}`)} className="flex items-center gap-3 cursor-pointer">
                      <img src={user.avatar_url || 'https://picsum.photos/50'} className="w-12 h-12 rounded-full object-cover" />
                      <div>
                          <p className="font-bold flex items-center">
                              {user.username}
                              {user.verified && (
                                  <div className="flex items-center justify-center w-3 h-3 bg-[#20D5EC] rounded-full ml-1">
                                      <i className="fas fa-check text-white text-[7px] font-bold"></i>
                                  </div>
                              )}
                          </p>
                          <p className="text-xs text-gray-500">{formatNumber(user.followers_count)} followers</p>
                      </div>
                  </div>
              ))}
          </div>
      ) : (
          <>
            <h2 className="font-bold text-lg mb-4 bg-gradient-to-r from-cyan-400 to-pink-500 text-transparent bg-clip-text">Trending New Creators</h2>
            <div className="grid grid-cols-2 gap-2">
                {trendingVideos.map(video => (
                    <div key={video.id} className="relative aspect-[9/16] bg-gray-900 rounded-lg overflow-hidden cursor-pointer" onClick={() => navigate(`/video/${video.id}`)}>
                        <video src={video.video_url} className="w-full h-full object-cover" muted />
                        <div className="absolute bottom-2 left-2 text-xs font-bold shadow-black drop-shadow-md text-white">
                            <i className="fas fa-play mr-1"></i> {formatNumber(video.views_count)}
                        </div>
                        <div className="absolute top-2 right-2">
                            <img src={video.profiles?.avatar_url || ''} className="w-6 h-6 rounded-full border border-white" />
                        </div>
                    </div>
                ))}
            </div>
          </>
      )}
    </div>
  );
};