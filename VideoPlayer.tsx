import React, { useRef, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Video, Comment } from '../types';
import { formatNumber } from '../utils';

interface VideoPlayerProps {
  video: Video;
  isActive: boolean;
  onProfileClick: (userId: string) => void;
  onDelete?: (videoId: string) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, isActive, onProfileClick, onDelete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Initialize state from props, but allow local updates
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(video.likes_count || 0);
  const [viewCount, setViewCount] = useState(video.views_count || 0);
  const [shareCount, setShareCount] = useState(video.shares_count || 0);
  const [isPinned, setIsPinned] = useState(video.pinned || false);

  const [showHeart, setShowHeart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  
  const [isFollowing, setIsFollowing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isLikeProcessing, setIsLikeProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [hasStories, setHasStories] = useState(false);

  const watchTimeRef = useRef(0);
  const viewCountedRef = useRef(false);

  // Sync state with props when they change
  useEffect(() => {
    setLikeCount(video.likes_count || 0);
    setViewCount(video.views_count || 0);
    setShareCount(video.shares_count || 0);
    setIsPinned(video.pinned || false);
  }, [video.likes_count, video.views_count, video.shares_count, video.pinned]);

  // Monitor Auth State Changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        const userId = session?.user?.id || null;
        setCurrentUser(userId);
    });

    supabase.auth.getUser().then(({ data }) => {
        setCurrentUser(data.user?.id || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Check stories existence
  useEffect(() => {
      const checkStories = async () => {
          if (!video.user_id) return;
          const { count } = await supabase
              .from('stories')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', video.user_id)
              .gt('expires_at', new Date().toISOString());
          
          setHasStories((count || 0) > 0);
      };
      checkStories();
  }, [video.user_id]);

  // Check ownership, like status, and follow status
  useEffect(() => {
    const checkStatus = async () => {
      if (currentUser) {
        setIsOwner(currentUser === video.user_id);
        
        const { data: likeData } = await supabase
          .from('likes')
          .select('id')
          .eq('video_id', video.id)
          .eq('user_id', currentUser)
          .maybeSingle();
        
        setLiked(!!likeData);

        if (currentUser !== video.user_id) {
           const { data: followData } = await supabase
            .from('follows')
            .select('follower_id')
            .eq('follower_id', currentUser)
            .eq('following_id', video.user_id)
            .maybeSingle();
           
           setIsFollowing(!!followData);
        } else {
            setIsFollowing(false);
        }
      } else {
          setLiked(false);
          setIsFollowing(false);
          setIsOwner(false);
      }
    };
    checkStatus();
  }, [video.id, video.user_id, currentUser]);

  // Handle Playback State
  useEffect(() => {
    if (isActive) {
      if (videoRef.current && !videoError) {
        videoRef.current.currentTime = 0;
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
            })
            .catch(e => {
              // Ignore AbortError which happens if pause() is called before play() finishes
              if (e.name !== 'AbortError') {
                console.error("Video playback error:", e);
              }
              setIsPlaying(false);
            });
        }
      }
      watchTimeRef.current = 0;
      
      const hasViewedSession = sessionStorage.getItem(`viewed-${video.id}`);
      viewCountedRef.current = !!hasViewedSession;
    } else {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      setIsPlaying(false);
    }
  }, [isActive, videoError, video.id]);

  // View Counting Logic
  useEffect(() => {
    let interval: any;
    if (isPlaying && isActive && !viewCountedRef.current) {
      interval = setInterval(async () => {
        watchTimeRef.current += 1;
        // Increase views after 2 seconds
        if (watchTimeRef.current >= 2) {
          viewCountedRef.current = true;
          sessionStorage.setItem(`viewed-${video.id}`, 'true');
          
          // Visual update
          setViewCount(prev => prev + 1);
          
          try {
            await supabase.rpc('increment_view_count', { video_id_input: video.id });
          } catch (err) {
            console.error("View count error:", err);
          }
          
          clearInterval(interval);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isActive, video.id]);

  const togglePlay = () => {
    if (!videoRef.current || videoError) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(e => {
            setIsPlaying(false);
            if (e.name !== 'AbortError') {
               console.error("Play toggle error:", e);
            }
          });
      }
      setIsPlaying(true);
    }
  };

  const handleLike = async () => {
    if (isLikeProcessing) return; 
    setIsLikeProcessing(true);

    const newLikedState = !liked;
    setLiked(newLikedState);
    setLikeCount(prev => newLikedState ? prev + 1 : Math.max(0, prev - 1));
    
    try {
        if (!currentUser) {
            setIsLikeProcessing(false);
            setLiked(!newLikedState);
            setLikeCount(prev => !newLikedState ? prev + 1 : Math.max(0, prev - 1));
            return;
        }

        if (newLikedState) {
            const { error } = await supabase.from('likes').insert({ video_id: video.id, user_id: currentUser });
            if (error && error.code !== '23505') throw error;
            if (!error) await supabase.rpc('increment_like_count', { video_id_input: video.id });
        } else {
            const { error } = await supabase.from('likes').delete().eq('video_id', video.id).eq('user_id', currentUser);
            if (!error) await supabase.rpc('decrement_like_count', { video_id_input: video.id });
            else throw error;
        }
    } catch (e) {
        console.error("Like interaction failed:", e);
        setLiked(!newLikedState);
        setLikeCount(prev => !newLikedState ? prev + 1 : Math.max(0, prev - 1));
    } finally {
        setIsLikeProcessing(false);
    }
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 1000);
    if (!liked) handleLike();
  };

  const handleFollow = async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        if (!currentUser) return;
        
        if (isFollowing) {
           await supabase.from('follows').delete().eq('follower_id', currentUser).eq('following_id', video.user_id);
           setIsFollowing(false);
        } else {
           await supabase.from('follows').insert({ follower_id: currentUser, following_id: video.user_id });
           setIsFollowing(true);
        }
      } catch (err) {
          console.error("Follow error", err);
      }
  };

  const handlePin = async () => {
      if (!isOwner) return;
      const newPinState = !isPinned;
      
      // Optimistic update
      setIsPinned(newPinState);
      
      try {
          const { error } = await supabase
            .from('videos')
            .update({ pinned: newPinState })
            .eq('id', video.id);
            
          if (error) throw error;
      } catch (e: any) {
          // Revert on error
          setIsPinned(!newPinState);
          console.error("Pin error:", e);
          alert(`Pin failed: ${e.message || JSON.stringify(e)}\n\nPlease ensure you have run the updated SQL script.`);
      }
  };

  const handleDownload = async () => {
      setIsDownloading(true);
      try {
          const response = await fetch(video.video_url);
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `Reelflow_${video.profiles?.username || 'user'}_${video.id.slice(0,6)}.mp4`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          
          setShareCount(prev => prev + 1);
          await supabase.rpc('increment_share_count', { video_id_input: video.id });
      } catch (err) {
          alert("Download failed. Please try again.");
      } finally {
          setIsDownloading(false);
      }
  };

  const handleShare = async () => {
     setShareCount(prev => prev + 1);
     const link = `${window.location.origin}/#/video/${video.id}`;
     try {
        await navigator.clipboard.writeText(link);
        const performDownload = window.confirm(`Link copied!\n${link}\n\nDo you want to download this video?`);
        if (performDownload) {
            handleDownload();
        }
     } catch (err) {
        alert(`Link: ${link}`);
     }
     await supabase.rpc('increment_share_count', { video_id_input: video.id });
  };

  const handleDelete = async () => {
      if (confirm("Are you sure you want to delete this video?")) {
          const { error } = await supabase.from('videos').delete().eq('id', video.id);
          if (error) {
              alert("Error deleting video: " + error.message);
          } else {
              if (onDelete) onDelete(video.id);
          }
      }
  };

  const fetchComments = async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profiles:user_id(*)')
      .eq('video_id', video.id)
      .order('created_at', { ascending: false });
    if (data) setComments(data);
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    if (!currentUser) return;

    const { data, error } = await supabase.from('comments').insert({
      video_id: video.id,
      user_id: currentUser,
      text: newComment
    }).select('*, profiles:user_id(*)').single();

    if (!error && data) {
      setComments([data, ...comments]);
      setNewComment('');
    }
  };

  if (!video.video_url) return null;

  return (
    <div className="relative w-full h-full bg-black snap-start overflow-hidden group">
      <video
        ref={videoRef}
        src={video.video_url}
        className="w-full h-full object-cover"
        loop
        playsInline
        muted={false}
        onClick={togglePlay}
        onDoubleClick={handleDoubleTap}
        onError={() => setVideoError(true)}
      />

      {videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10 text-white">
              <div className="text-center">
                  <i className="fas fa-exclamation-triangle text-2xl mb-2 text-yellow-500"></i>
                  <p>Video failed to load</p>
              </div>
          </div>
      )}

      {!isPlaying && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <i className="fas fa-play text-6xl text-white/50 backdrop-blur-sm rounded-full p-4"></i>
        </div>
      )}

      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none animate-ping z-20">
          <i className="fas fa-heart text-8xl text-pink-500 drop-shadow-lg"></i>
        </div>
      )}
      
      {/* Downloading Overlay */}
      {isDownloading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
             <div className="animate-bounce mb-4">
                 <svg width="60" height="60" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_0_10px_rgba(37,99,235,0.8)]">
                    <path d="M8 5V19L19 12L8 5Z" />
                 </svg>
             </div>
             <p className="font-bold text-white mb-1">Reelflow</p>
             <p className="text-xs text-gray-300">@{video.profiles?.username}</p>
             <p className="mt-4 text-cyan-400 font-bold animate-pulse">Downloading...</p>
          </div>
      )}

      {/* Right Sidebar */}
      <div className="absolute right-2 bottom-24 flex flex-col items-center gap-6 z-30">
        <div className="relative group cursor-pointer" onClick={() => onProfileClick(video.user_id)}>
            {/* Avatar Container with Conditional Gradient Ring */}
            <div className={`rounded-full p-[2px] ${hasStories ? 'bg-gradient-to-tr from-blue-500 to-pink-500' : 'bg-transparent'}`}>
               <div className="w-12 h-12 rounded-full border-2 border-white overflow-hidden bg-gray-800">
                   <img src={video.profiles?.avatar_url || 'https://picsum.photos/50'} className="w-full h-full object-cover" />
               </div>
            </div>
           
           {!isFollowing && !isOwner && (
               <div onClick={(e) => { e.stopPropagation(); handleFollow(e); }} className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-pink-500 rounded-full w-5 h-5 flex items-center justify-center cursor-pointer shadow-sm hover:scale-110 transition-transform">
                <i className="fas fa-plus text-[10px] text-white font-bold"></i>
               </div>
           )}
           {isFollowing && (
               <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 bg-white rounded-full w-5 h-5 flex items-center justify-center">
                 <i className="fas fa-check text-[10px] text-pink-500"></i>
               </div>
           )}
        </div>

        {/* Like Button with Dynamic Color */}
        <div className={`flex flex-col items-center cursor-pointer transition-transform duration-200 ${liked ? 'scale-110' : ''}`} onClick={handleLike}>
          <i className={`fas fa-heart text-3xl transition-colors duration-200 ${liked ? 'text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'text-white drop-shadow-md'}`}></i>
          <span className="text-xs font-bold mt-1 text-white shadow-black drop-shadow-md">{formatNumber(likeCount)}</span>
        </div>

        <div className="flex flex-col items-center cursor-pointer" onClick={() => { setShowComments(true); fetchComments(); }}>
          <i className="fas fa-comment-dots text-3xl text-white drop-shadow-md"></i>
          <span className="text-xs font-bold mt-1 text-white shadow-black drop-shadow-md">{formatNumber(comments.length || video.comments_count || 0)}</span>
        </div>

        <div className="flex flex-col items-center cursor-pointer" onClick={handleShare}>
          <i className="fas fa-share text-3xl text-white drop-shadow-md"></i>
          <span className="text-xs font-bold mt-1 text-white shadow-black drop-shadow-md">{formatNumber(shareCount)}</span>
        </div>

        {isOwner && (
            <>
                <div className="flex flex-col items-center cursor-pointer" onClick={handlePin}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${isPinned ? 'bg-gradient-to-br from-blue-500 to-pink-500' : 'bg-black/40'}`}>
                        <i className="fas fa-thumbtack text-white text-lg transform rotate-45"></i>
                    </div>
                    <span className="text-[10px] mt-1 text-white shadow-black drop-shadow-md">{isPinned ? 'Pinned' : 'Pin'}</span>
                </div>
                
                <div className="flex flex-col items-center cursor-pointer" onClick={handleDelete}>
                    <div className="w-10 h-10 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
                        <i className="fas fa-trash text-red-500 text-lg"></i>
                    </div>
                </div>
            </>
        )}
      </div>

      {/* Bottom Info Section */}
      <div className="absolute bottom-0 left-0 w-full z-20 pointer-events-none h-48 bg-gradient-to-t from-black via-black/50 to-transparent flex flex-col justify-end pb-20 px-4">
        <div className="pointer-events-auto max-w-[80%]">
            <div className="flex items-center gap-1 mb-1">
                <h3 className="font-bold text-lg text-white shadow-black drop-shadow-md cursor-pointer" onClick={() => onProfileClick(video.user_id)}>
                  @{video.profiles?.username}
                </h3>
                {video.profiles?.verified && (
                     <div className="flex items-center justify-center w-3 h-3 bg-[#20D5EC] rounded-full ml-1">
                        <i className="fas fa-check text-white text-[7px] font-bold"></i>
                     </div>
                )}
            </div>
            
            {/* Pinned Badge on Video Feed */}
            {isPinned && (
                <div className="inline-block px-2 py-0.5 rounded bg-gradient-to-r from-blue-600 to-pink-600 text-[10px] font-bold text-white mb-2 shadow-sm">
                    <i className="fas fa-thumbtack mr-1 text-[8px]"></i> Pinned
                </div>
            )}
            
            <p className="text-white text-sm leading-tight drop-shadow-md mb-2 break-words">
              {video.description}
            </p>
            <div className="flex items-center text-white/90 text-xs gap-2">
                <i className="fas fa-music"></i>
                <div className="w-40 overflow-hidden">
                    <p className="whitespace-nowrap animate-marquee">Original Sound - {video.profiles?.username}</p>
                </div>
            </div>
        </div>
      </div>

      {/* Comment Sheet */}
      {showComments && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50 backdrop-blur-sm" onClick={() => setShowComments(false)}>
          <div className="bg-[#121212] rounded-t-2xl h-[70%] w-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <div className="flex-1 text-center font-bold text-sm">Comments ({comments.length})</div>
              <button onClick={() => setShowComments(false)} className="p-2"><i className="fas fa-times text-gray-400"></i></button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4 p-4 no-scrollbar">
              {comments.map(c => (
                <div key={c.id} className="flex gap-3">
                  <img src={c.profiles?.avatar_url || 'https://picsum.photos/30'} className="w-8 h-8 rounded-full bg-gray-700" />
                  <div>
                    <span className="text-xs text-gray-400 flex items-center font-bold mb-0.5">
                      @{c.profiles?.username}
                      {c.profiles?.verified && (
                        <div className="flex items-center justify-center w-3 h-3 bg-[#20D5EC] rounded-full ml-1">
                            <i className="fas fa-check text-white text-[7px] font-bold"></i>
                        </div>
                      )}
                    </span>
                    <p className="text-sm text-gray-100">{c.text}</p>
                    <span className="text-[10px] text-gray-500">{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={handleCommentSubmit} className="flex gap-3 items-center border-t border-gray-800 p-4 bg-[#121212] pb-6 sm:pb-4">
              <input 
                type="text" 
                value={newComment} 
                onChange={(e) => setNewComment(e.target.value)} 
                placeholder="Add comment..."
                className="flex-1 bg-gray-800 rounded-full px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all border border-gray-700"
              />
              <button type="submit" className="text-cyan-400 font-bold p-2 bg-gray-800 rounded-full w-10 h-10 flex items-center justify-center hover:bg-gray-700"><i className="fas fa-paper-plane"></i></button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};