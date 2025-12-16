import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Profile as ProfileType, Video, Story } from '../types';
import { formatNumber } from '../utils';
import { useParams, useNavigate } from 'react-router-dom';

export const Profile = () => {
  const { userId: routeUserId } = useParams();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState<ProfileType | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [likedVideos, setLikedVideos] = useState<Video[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeTab, setActiveTab] = useState<'videos' | 'likes'>('videos');
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const [isFollowing, setIsFollowing] = useState(false);
  
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Story States
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [isUploadingStory, setIsUploadingStory] = useState(false);
  const [viewingStory, setViewingStory] = useState(false);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const storyVideoRef = useRef<HTMLVideoElement>(null);
  const [storyProgress, setStoryProgress] = useState(0);

  useEffect(() => {
    fetchProfileData();
  }, [routeUserId]);

  // Real-time subscriptions
  useEffect(() => {
    if (!profile?.id) return;

    const profileChannel = supabase.channel(`profile:${profile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` }, 
        (payload) => setProfile(prev => prev ? { ...prev, ...payload.new as ProfileType } : null)
      ).subscribe();

    const videosChannel = supabase.channel(`videos:${profile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'videos', filter: `user_id=eq.${profile.id}` }, 
        (payload) => {
            const updatedVideo = payload.new as Video;
            setVideos(prev => {
                const newVideos = prev.map(v => v.id === updatedVideo.id ? { ...v, ...updatedVideo } : v);
                return newVideos.sort((a, b) => {
                    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                });
            });
        }
      ).subscribe();
      
    // Subscribe to stories
    const storiesChannel = supabase.channel(`stories:${profile.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stories', filter: `user_id=eq.${profile.id}` },
        () => fetchStories(profile.id)
        ).subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(videosChannel);
      supabase.removeChannel(storiesChannel);
    };
  }, [profile?.id]);

  // Story Viewer Timer
  useEffect(() => {
    let interval: any;
    if (viewingStory && storyVideoRef.current) {
        interval = setInterval(() => {
            if (storyVideoRef.current) {
                const progress = (storyVideoRef.current.currentTime / storyVideoRef.current.duration) * 100;
                setStoryProgress(progress);
                if (progress >= 100) {
                    handleNextStory();
                }
            }
        }, 100);
    }
    return () => clearInterval(interval);
  }, [viewingStory, currentStoryIndex]);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !currentUser) {
         if (!routeUserId) { setLoading(false); return; }
      }

      const targetId = routeUserId || currentUser?.id;
      if (!targetId) return;

      setIsOwnProfile(currentUser?.id === targetId);

      let { data: profileData } = await supabase.from('profiles').select('*').eq('id', targetId).maybeSingle();
      
      // Self-healing
      if (!profileData && currentUser && currentUser.id === targetId) {
        const randomSuffix = Math.floor(100000 + Math.random() * 900000);
        const autoUsername = `user${randomSuffix}`;
        const { data: newProfile } = await supabase.from('profiles').insert([{
             id: currentUser.id, username: autoUsername,
             avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${autoUsername}`,
             followers_count: 0, following_count: 0
          }]).select().single();
        if (newProfile) profileData = newProfile;
      }

      if (profileData) {
        setProfile(profileData);
        setEditUsername(profileData.username);
        setEditBio(profileData.bio || '');

        if (currentUser && currentUser.id !== targetId) {
            const { data: followData } = await supabase.from('follows').select('follower_id').match({ follower_id: currentUser.id, following_id: targetId }).maybeSingle();
            setIsFollowing(!!followData);
        }
        
        await fetchStories(profileData.id);
      }

      // Fetch Videos
      let { data: videoData, error: videoError } = await supabase
        .from('videos')
        .select('*')
        .eq('user_id', targetId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (videoError) {
          // Fallback if pinned column missing
          const { data: fallbackData } = await supabase.from('videos').select('*').eq('user_id', targetId).order('created_at', { ascending: false });
          videoData = fallbackData;
      }

      if (videoData) {
          const uniqueVideos = Array.from(new Map(videoData.map((v: any) => [v.id, v])).values()) as Video[];
          setVideos(uniqueVideos);
      }
      
      // Fetch Liked Videos
      if (currentUser?.id === targetId) {
          const { data: likesData } = await supabase.from('likes').select('video_id, videos(*)').eq('user_id', targetId).order('created_at', { ascending: false });
          if (likesData) {
              const liked = likesData.map((l: any) => l.videos).filter((v: any) => v !== null) as Video[];
              setLikedVideos(liked);
          }
      }

    } catch (e) {
      console.error("Profile error:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStories = async (userId: string) => {
      // Fetch valid stories (not expired)
      const { data } = await supabase
        .from('stories')
        .select('*')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true });
      
      if (data) setStories(data);
  };

  const handleSignOut = async () => {
      if (window.confirm("Are you sure you want to log out?")) {
        try {
            await supabase.auth.signOut();
            // Force a hard reset to ensure AuthScreen appears
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload(); 
        } catch (error) { 
            console.error("Sign out error:", error);
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
        } 
      }
  };

  const handleDeleteAccount = async () => {
      if (!isOwnProfile) return;
      if (window.confirm("ARE YOU SURE? This will permanently delete your account.")) {
          try {
              const { error } = await supabase.rpc('delete_own_account');
              if (error) throw error;
              await supabase.auth.signOut();
              window.location.reload();
          } catch (e: any) { alert("Error deleting account: " + e.message); }
      }
  };

  const handleMessage = () => { if(profile) navigate(`/inbox?chatWith=${profile.id}`); };

  const handleFollowToggle = async () => {
      if (!profile) return;
      try {
          const user = (await supabase.auth.getUser()).data.user;
          if (!user) return;
          const newStatus = !isFollowing;
          setIsFollowing(newStatus);
          setProfile(prev => prev ? { ...prev, followers_count: newStatus ? (prev.followers_count + 1) : Math.max(0, prev.followers_count - 1) } : null);
          if (newStatus) await supabase.from('follows').insert({ follower_id: user.id, following_id: profile.id });
          else await supabase.from('follows').delete().match({ follower_id: user.id, following_id: profile.id });
      } catch (err) { console.error(err); setIsFollowing(!isFollowing); fetchProfileData(); }
  };

  const copyProfileLink = () => {
      if(profile) {
          const link = `${window.location.origin}/#/profile/${profile.id}`;
          navigator.clipboard.writeText(link);
          alert(`Profile link copied!\n${link}`);
      }
  };

  const saveProfile = async () => {
      if (!profile) return;
      setSavingProfile(true);
      try {
          const user = (await supabase.auth.getUser()).data.user;
          if (!user || user.id !== profile.id) throw new Error("Unauthorized");
          
          if (editUsername !== profile.username) {
              const { data: existing } = await supabase.from('profiles').select('id').eq('username', editUsername).single();
              if (existing) throw new Error("Username already taken.");
          }

          let avatarUrl = profile.avatar_url;
          if (editAvatarFile) {
              const fileExt = editAvatarFile.name.split('.').pop();
              const safeFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
              const filePath = `${user.id}/${safeFileName}`;
              await supabase.storage.from('avatars').upload(filePath, editAvatarFile, { upsert: true });
              const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
              avatarUrl = urlData.publicUrl;
          }

          const updates = { username: editUsername, bio: editBio, avatar_url: avatarUrl };
          await supabase.from('profiles').update(updates).eq('id', user.id);
          setProfile(prev => prev ? ({ ...prev, ...updates }) : null);
          setShowEditModal(false);
      } catch (e: any) { alert(e.message); } finally { setSavingProfile(false); }
  };

  // --- Story Functions ---

  const handleStoryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          // Simple validation
          if (file.size > 50 * 1024 * 1024) { // 50MB limit
              alert("File too large. Max 50MB.");
              return;
          }
          uploadStory(file);
      }
  };

  const uploadStory = async (file: File) => {
      if (!profile) return;
      setIsUploadingStory(true);
      try {
          const fileExt = file.name.split('.').pop();
          const safeFileName = `story-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `${profile.id}/${safeFileName}`;

          const { error: uploadError } = await supabase.storage.from('videos').upload(filePath, file);
          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage.from('videos').getPublicUrl(filePath);

          const { error: dbError } = await supabase.from('stories').insert({
              user_id: profile.id,
              video_url: publicUrl
          });
          if (dbError) throw dbError;
          
          // Refresh
          fetchStories(profile.id);
          alert("Story posted!");

      } catch (e: any) {
          console.error(e);
          alert("Story upload failed: " + e.message);
      } finally {
          setIsUploadingStory(false);
      }
  };

  const handleAvatarClick = () => {
      if (stories.length > 0) {
          setViewingStory(true);
          setCurrentStoryIndex(0);
          setStoryProgress(0);
      } else if (isOwnProfile) {
          document.getElementById('story-upload-input')?.click();
      }
  };

  const handleNextStory = () => {
      if (currentStoryIndex < stories.length - 1) {
          setCurrentStoryIndex(prev => prev + 1);
          setStoryProgress(0);
      } else {
          setViewingStory(false); // Close if last story
      }
  };
  
  const handlePrevStory = () => {
      if (currentStoryIndex > 0) {
          setCurrentStoryIndex(prev => prev - 1);
          setStoryProgress(0);
      }
  };

  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-black text-white">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
    </div>
  );

  if (!profile) return (
    <div className="flex flex-col h-screen w-full items-center justify-center bg-black text-white gap-4 p-6 text-center">
      <div className="w-20 h-20 rounded-full bg-gray-900 flex items-center justify-center mb-2">
        <i className="fas fa-user-slash text-gray-600 text-3xl"></i>
      </div>
      <h3 className="text-xl font-bold">Profile not found</h3>
      <button onClick={() => window.location.reload()} className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-pink-600 rounded-full font-bold mt-4">Refresh Page</button>
    </div>
  );

  const totalLikes = videos.reduce((acc, v) => acc + (v.likes_count || 0), 0);
  const displayVideos = activeTab === 'videos' ? videos : likedVideos;
  const hasStories = stories.length > 0;

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="flex justify-between items-center p-4 border-b border-gray-900 sticky top-0 bg-black z-10">
        <span className="font-bold truncate max-w-[200px]">{profile.username}</span>
        <div className="flex gap-2">
            <button onClick={copyProfileLink} className="text-gray-400 p-2"><i className="fas fa-link"></i></button>
            {isOwnProfile ? (
                <button onClick={handleSignOut} className="text-red-400 text-xs px-3 py-1 bg-gray-900 rounded-full border border-gray-700 flex items-center gap-1 hover:bg-gray-800 transition-colors">
                    <i className="fas fa-sign-out-alt"></i> Logout
                </button>
            ) : (
                <button className="p-2"><i className="fas fa-ellipsis-h"></i></button>
            )}
        </div>
      </div>

      <div className="flex flex-col items-center pt-6 pb-6 relative">
        <div className="relative group cursor-pointer" onClick={handleAvatarClick}>
            {/* Pink/Blue Ring Container */}
            <div className={`rounded-full p-[3px] ${hasStories ? 'bg-gradient-to-tr from-blue-500 to-pink-500' : 'bg-transparent'}`}>
                <img 
                    src={profile.avatar_url || 'https://picsum.photos/100'} 
                    className="w-24 h-24 rounded-full border-2 border-black object-cover bg-gray-800 block" 
                />
            </div>

            {/* Upload Story Badge (Only for Owner when no stories, OR generic upload trigger) */}
            {isOwnProfile && !hasStories && (
               <div className="absolute bottom-1 right-1 bg-blue-500 border-2 border-black rounded-full w-7 h-7 flex items-center justify-center">
                   {isUploadingStory ? (
                       <i className="fas fa-spinner fa-spin text-white text-xs"></i>
                   ) : (
                       <i className="fas fa-plus text-white text-sm"></i>
                   )}
               </div>
            )}
            
            {/* Hidden Input for Story Upload */}
            <input 
                id="story-upload-input" 
                type="file" 
                accept="video/*" 
                className="hidden" 
                onChange={handleStoryFileChange}
            />
        </div>
        
        <div className="flex items-center justify-center gap-1 mt-3">
            <p className="text-center text-lg font-bold">@{profile.username}</p>
            {profile.verified && (
                <div className="flex items-center justify-center w-4 h-4 bg-[#20D5EC] rounded-full">
                    <i className="fas fa-check text-white text-[10px]"></i>
                </div>
            )}
        </div>
        
        <div className="flex gap-8 mt-4 text-center">
            <div className="cursor-pointer hover:opacity-80">
                <span className="font-bold block">{formatNumber(profile.following_count)}</span>
                <span className="text-xs text-gray-400">Following</span>
            </div>
            <div className="cursor-pointer hover:opacity-80">
                <span className="font-bold block">{formatNumber(profile.followers_count)}</span>
                <span className="text-xs text-gray-400">Followers</span>
            </div>
            <div className="cursor-pointer hover:opacity-80">
                <span className="font-bold block">{formatNumber(totalLikes)}</span>
                <span className="text-xs text-gray-400">Likes</span>
            </div>
        </div>

        <div className="flex gap-2 mt-6">
            {isOwnProfile ? (
                <button onClick={() => setShowEditModal(true)} className="px-8 py-2 bg-gray-800 rounded-md font-semibold text-sm border border-gray-700 hover:bg-gray-700 transition-all">Edit Profile</button>
            ) : (
                <>
                  <button onClick={handleFollowToggle} className={`px-12 py-2 rounded-md font-semibold text-sm text-white transition-colors ${isFollowing ? 'bg-gray-700' : 'bg-pink-500'}`}>{isFollowing ? 'Following' : 'Follow'}</button>
                  <button onClick={handleMessage} className="px-4 py-2 bg-gray-800 rounded-md font-semibold text-sm">Message</button>
                </>
            )}
        </div>
        
        <p className="mt-4 text-sm text-center px-6 text-gray-300">{profile.bio || "No bio yet."}</p>
      </div>

      <div className="flex border-b border-gray-800">
        <div onClick={() => setActiveTab('videos')} className={`flex-1 text-center py-3 cursor-pointer ${activeTab === 'videos' ? 'border-b-2 border-white text-white' : 'text-gray-500'}`}><i className="fas fa-th"></i></div>
        {isOwnProfile && <div onClick={() => setActiveTab('likes')} className={`flex-1 text-center py-3 cursor-pointer ${activeTab === 'likes' ? 'border-b-2 border-white text-white' : 'text-gray-500'}`}><i className="fas fa-heart"></i></div>}
        {!isOwnProfile && <div className="flex-1 text-center py-3 text-gray-500 cursor-pointer"><i className="fas fa-lock"></i></div>}
      </div>

      <div className="grid grid-cols-3 gap-[1px]">
        {displayVideos.map(video => (
            <div key={video.id} className="relative aspect-[3/4] bg-gray-900 cursor-pointer group" onClick={() => navigate(`/video/${video.id}`)}>
                <video src={video.video_url} className="w-full h-full object-cover" muted playsInline />
                <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors"></div>
                {video.pinned && activeTab === 'videos' && (
                    <div className="absolute top-1 left-1 px-2 py-0.5 rounded-md bg-gradient-to-r from-blue-600 to-pink-600 z-10 shadow-sm">
                        <span className="text-[10px] font-bold text-white flex items-center gap-1"><i className="fas fa-thumbtack text-[8px]"></i> Pinned</span>
                    </div>
                )}
                <div className="absolute bottom-1 left-1 text-xs font-bold flex items-center shadow-black drop-shadow-md z-10 text-white"><i className="fas fa-play text-[10px] mr-1"></i> {formatNumber(video.views_count)}</div>
            </div>
        ))}
      </div>
      
      {displayVideos.length === 0 && (
          <div className="py-10 text-center text-gray-500 text-sm">
              <i className="fas fa-video text-4xl mb-2 opacity-50"></i>
              <p>{activeTab === 'videos' ? 'No videos uploaded' : 'No liked videos yet'}</p>
              {isOwnProfile && activeTab === 'videos' && <button onClick={() => navigate('/upload')} className="mt-4 px-4 py-2 bg-gray-800 rounded-full text-xs text-white">Upload Video</button>}
          </div>
      )}

      {/* Edit Modal */}
      {showEditModal && profile && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
              <div className="bg-gray-900 rounded-xl p-6 w-full max-w-sm border border-gray-800">
                  <h3 className="text-xl font-bold mb-4">Edit Profile</h3>
                  <div className="flex flex-col gap-4">
                      <div className="flex flex-col items-center">
                          <img src={editAvatarFile ? URL.createObjectURL(editAvatarFile) : (profile.avatar_url || '')} className="w-20 h-20 rounded-full mb-2 object-cover bg-gray-800" />
                          <label className="text-cyan-400 text-sm cursor-pointer hover:text-cyan-300">Change Photo<input type="file" className="hidden" accept="image/*" onChange={e => e.target.files && setEditAvatarFile(e.target.files[0])} /></label>
                      </div>
                      <div><label className="text-xs text-gray-400">Username</label><input value={editUsername} onChange={e => setEditUsername(e.target.value)} className="w-full bg-gray-800 p-2 rounded text-white focus:outline-none focus:border-cyan-500 border border-transparent" /></div>
                      <div><label className="text-xs text-gray-400">Bio</label><textarea value={editBio} onChange={e => setEditBio(e.target.value)} className="w-full bg-gray-800 p-2 rounded text-white h-20 focus:outline-none focus:border-cyan-500 border border-transparent" /></div>
                      <div className="flex gap-2 mt-2"><button onClick={() => setShowEditModal(false)} className="flex-1 py-2 bg-gray-700 rounded hover:bg-gray-600">Cancel</button><button onClick={saveProfile} disabled={savingProfile} className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-pink-500 rounded font-bold hover:opacity-90">{savingProfile ? 'Saving...' : 'Save'}</button></div>
                      <div className="mt-4 pt-4 border-t border-gray-800 flex flex-col gap-2"><button onClick={handleDeleteAccount} className="w-full py-2 text-red-500 text-sm hover:bg-gray-800 rounded"><i className="fas fa-trash-alt mr-2"></i> Delete Account</button></div>
                  </div>
              </div>
          </div>
      )}

      {/* Story Viewer Overlay */}
      {viewingStory && stories.length > 0 && (
          <div className="fixed inset-0 z-[100] bg-black flex flex-col">
              <div className="absolute top-0 left-0 w-full h-1 bg-gray-700 z-20">
                  <div className="h-full bg-white transition-all duration-100 ease-linear" style={{ width: `${storyProgress}%` }}></div>
              </div>
              
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                  <img src={profile.avatar_url || ''} className="w-8 h-8 rounded-full border border-white" />
                  <span className="font-bold shadow-black drop-shadow-md text-sm">{profile.username}</span>
                  <span className="text-gray-300 text-xs shadow-black drop-shadow-md">• {Math.floor((new Date().getTime() - new Date(stories[currentStoryIndex].created_at).getTime()) / 3600000)}h ago</span>
              </div>
              
              <button onClick={() => setViewingStory(false)} className="absolute top-4 right-4 z-20 text-white text-2xl drop-shadow-md"><i className="fas fa-times"></i></button>
              
              <div className="flex-1 relative flex items-center justify-center bg-gray-900" onClick={(e) => {
                  const width = window.innerWidth;
                  if (e.clientX < width / 3) handlePrevStory();
                  else handleNextStory();
              }}>
                  <video 
                    ref={storyVideoRef}
                    src={stories[currentStoryIndex].video_url} 
                    className="w-full h-full object-contain" 
                    autoPlay 
                    playsInline 
                  />
                  
                  {/* Navigation Zones Hint (Optional) */}
                  <div className="absolute inset-y-0 left-0 w-1/3 z-10"></div>
                  <div className="absolute inset-y-0 right-0 w-2/3 z-10"></div>
              </div>
              
              {/* Input for reply or add story could go here */}
              <div className="absolute bottom-10 w-full px-4 z-20">
                  {isOwnProfile && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); document.getElementById('story-upload-input')?.click(); }}
                        className="w-full py-3 bg-gray-800/80 backdrop-blur rounded-full font-bold text-sm"
                      >
                          + Add New Story
                      </button>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};