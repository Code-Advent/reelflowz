import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { Message, Profile, Conversation } from '../types';
import { useSearchParams } from 'react-router-dom';

export const Inbox = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatUser, setActiveChatUser] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [myId, setMyId] = useState<string | null>(null);
  
  // Admin Panel
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminLink, setAdminLink] = useState('');
  const [boostAmount, setBoostAmount] = useState<number>(0);
  const [adminStatus, setAdminStatus] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const init = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setMyId(user.id);
            fetchConversations(user.id);
            
            // Explicit Admin Check
            try {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('is_admin')
                    .eq('id', user.id)
                    .single();
                
                if (profile && profile.is_admin === true) {
                    setIsAdmin(true);
                }
            } catch (err) {
                console.error("Error checking admin status:", err);
            }
        }
    };
    init();
  }, []);

  useEffect(() => {
      const chatWithId = searchParams.get('chatWith');
      
      const startChat = async () => {
          if (chatWithId && myId) {
             const { data } = await supabase.from('profiles').select('*').eq('id', chatWithId).single();
             if (data) setActiveChatUser(data);
          }
      };
      
      if(myId) startChat();
  }, [myId, searchParams]);

  useEffect(() => {
      if (activeChatUser && myId) {
          fetchMessages();
          
          const channel = supabase
            .channel('messages')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'messages'
            }, (payload) => {
                const newMsg = payload.new as Message;
                if (
                    (newMsg.sender_id === activeChatUser.id && newMsg.receiver_id === myId) ||
                    (newMsg.sender_id === myId && newMsg.receiver_id === activeChatUser.id)
                ) {
                    setMessages(prev => [...prev, newMsg]);
                }
            })
            .subscribe();

          return () => { supabase.removeChannel(channel); };
      }
  }, [activeChatUser, myId]);

  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async (userId: string) => {
      const { data: allMessages } = await supabase
        .from('messages')
        .select('*, sender:sender_id(*), receiver:receiver_id(*)')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (!allMessages) return;

      const convMap = new Map<string, Conversation>();
      
      allMessages.forEach((msg: any) => {
          const otherUser = msg.sender_id === userId ? msg.receiver : msg.sender;
          if (!otherUser) return;
          
          if (!convMap.has(otherUser.id)) {
              convMap.set(otherUser.id, {
                  other_user: otherUser,
                  last_message: msg
              });
          }
      });

      setConversations(Array.from(convMap.values()));
  };

  const fetchMessages = async () => {
      if (!activeChatUser || !myId) return;

      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${myId},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${myId})`)
        .order('created_at', { ascending: true });
      
      if (data) setMessages(data);
  };

  const sendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim() || !activeChatUser || !myId) return;

      const content = newMessage;
      setNewMessage(''); 

      const { error } = await supabase.from('messages').insert({
          sender_id: myId,
          receiver_id: activeChatUser.id,
          content: content
      });

      if (error) {
          console.error("Send failed", error);
          alert("Failed to send");
      }
  };

  const parseIdFromLink = (link: string, type: 'video' | 'profile'): string | null => {
      try {
          // Handle various link formats (localhost, domain, etc)
          // Look for UUID pattern at the end
          const regex = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
          const match = link.match(regex);
          
          if (match && link.includes(type)) return match[0];
          return null;
      } catch {
          return null;
      }
  };

  const handleAdminToggle = () => {
      setShowAdminPanel(!showAdminPanel);
  };

  const handleBoost = async (type: 'views' | 'likes' | 'followers' | 'verify' | 'ban') => {
      setAdminStatus('Processing...');
      try {
          if (type === 'followers' || type === 'verify' || type === 'ban') {
              const userId = parseIdFromLink(adminLink, 'profile');
              if (!userId) throw new Error("Invalid Profile Link. Copy link from profile page.");

              if (type === 'followers') {
                  const { error } = await supabase.rpc('boost_profile_followers', {
                      user_id_input: userId,
                      followers_add: boostAmount
                  });
                  if (error) throw error;
                  setAdminStatus(`Success! Adjusted followers by ${boostAmount}.`);
              } else if (type === 'verify') {
                  const { error } = await supabase.rpc('set_user_verified', {
                      user_id_input: userId,
                      status: true
                  });
                  if (error) throw error;
                  setAdminStatus('Success! User verified.');
              } else if (type === 'ban') {
                  const { error } = await supabase.rpc('ban_user', {
                      user_id_input: userId,
                      ban_status: true
                  });
                  if (error) throw error;
                  setAdminStatus('Success! User banned.');
              }
          } else {
              const videoId = parseIdFromLink(adminLink, 'video');
              if (!videoId) throw new Error("Invalid Video Link. Copy link from share button.");

              const { error } = await supabase.rpc('boost_video_stats', {
                  video_id_input: videoId,
                  views_add: type === 'views' ? boostAmount : 0,
                  likes_add: type === 'likes' ? boostAmount : 0
              });
              if (error) throw error;
              setAdminStatus(`Success! Adjusted video ${type} by ${boostAmount}.`);
          }
      } catch (err: any) {
          setAdminStatus(`Error: ${err.message}`);
      }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4 pb-20 relative">
      
      {!activeChatUser && (
          <>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-xl font-bold">Inbox</h1>
                {isAdmin && (
                    <button 
                        onClick={handleAdminToggle} 
                        className={`text-xs px-3 py-1 rounded-full border transition-all ${showAdminPanel ? 'bg-pink-600 border-pink-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                    >
                        <i className="fas fa-tools mr-1"></i> {showAdminPanel ? 'Close Admin' : 'Admin Panel'}
                    </button>
                )}
            </div>

            {showAdminPanel && isAdmin && (
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-5 rounded-2xl mb-6 border border-gray-700 shadow-xl shadow-cyan-900/20">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-500 uppercase tracking-wide">
                            <i className="fas fa-rocket mr-2"></i>Admin Console
                        </h2>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-gray-400 ml-1 mb-1 block">Target Link (Profile or Video)</label>
                            <input 
                                className="w-full bg-black/50 p-3 rounded-lg text-sm border border-gray-600 focus:border-cyan-500 outline-none transition-colors text-white"
                                placeholder="Paste link here..."
                                value={adminLink}
                                onChange={(e) => setAdminLink(e.target.value)}
                            />
                            <p className="text-[10px] text-gray-500 mt-1">
                                Go to Profile/Video {'>'} Share {'>'} Copy Link
                            </p>
                        </div>

                        <div>
                            <label className="text-xs text-gray-400 ml-1 mb-1 block">Amount (Negative to reduce)</label>
                            <input 
                                type="number" 
                                className="w-full bg-black/50 p-3 rounded-lg text-sm border border-gray-600 focus:border-pink-500 outline-none transition-colors text-white"
                                placeholder="e.g. 1000 or -500"
                                value={boostAmount}
                                onChange={(e) => setBoostAmount(Number(e.target.value))}
                            />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <button onClick={() => handleBoost('views')} className="bg-gray-700 hover:bg-gray-600 hover:text-cyan-300 py-3 rounded-lg text-xs font-bold transition-all border border-gray-600">
                                <i className="fas fa-eye mr-1"></i> +/- Views
                            </button>
                            <button onClick={() => handleBoost('likes')} className="bg-gray-700 hover:bg-gray-600 hover:text-pink-400 py-3 rounded-lg text-xs font-bold transition-all border border-gray-600">
                                <i className="fas fa-heart mr-1"></i> +/- Likes
                            </button>
                            <button onClick={() => handleBoost('followers')} className="bg-gray-700 hover:bg-gray-600 hover:text-purple-400 py-3 rounded-lg text-xs font-bold transition-all border border-gray-600">
                                <i className="fas fa-users mr-1"></i> +/- Followers
                            </button>
                            <button onClick={() => handleBoost('verify')} className="bg-gradient-to-r from-blue-900 to-cyan-900 border border-cyan-700 py-3 rounded-lg text-xs font-bold text-cyan-200 shadow-lg shadow-cyan-900/50 hover:brightness-110 transition-all">
                                <i className="fas fa-check-circle mr-1"></i> Verify User
                            </button>
                            <button onClick={() => handleBoost('ban')} className="col-span-2 bg-red-900/50 border border-red-800 py-3 rounded-lg text-xs font-bold text-red-400 hover:bg-red-900 transition-all">
                                <i className="fas fa-ban mr-1"></i> Ban User
                            </button>
                        </div>
                    </div>
                    
                    {adminStatus && (
                        <div className={`text-xs text-center mt-4 p-2 rounded bg-black/30 border ${adminStatus.includes('Error') ? 'border-red-900 text-red-400' : 'border-green-900 text-green-400'}`}>
                            {adminStatus}
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-4">
                {conversations.length === 0 && <p className="text-gray-500 text-center mt-10">No messages yet.</p>}
                
                {conversations.map(conv => (
                    <div 
                        key={conv.other_user.id} 
                        onClick={() => setActiveChatUser(conv.other_user)}
                        className="flex items-center gap-4 p-2 active:bg-gray-900 rounded-lg cursor-pointer"
                    >
                        <img src={conv.other_user.avatar_url || 'https://picsum.photos/50'} className="w-12 h-12 rounded-full object-cover bg-gray-700" />
                        <div className="flex-1">
                            <h3 className="font-bold flex items-center">
                                {conv.other_user.username}
                                {conv.other_user.verified && (
                                    <div className="flex items-center justify-center w-3 h-3 bg-[#20D5EC] rounded-full ml-1">
                                        <i className="fas fa-check text-white text-[7px] font-bold"></i>
                                    </div>
                                )}
                            </h3>
                            <p className="text-gray-400 text-sm truncate">
                                {conv.last_message.sender_id === myId ? 'You: ' : ''}{conv.last_message.content}
                            </p>
                        </div>
                        <span className="text-gray-600 text-xs">{new Date(conv.last_message.created_at).toLocaleDateString()}</span>
                    </div>
                ))}
            </div>
          </>
      )}

      {activeChatUser && (
          <div className="fixed inset-0 z-[60] bg-black flex flex-col">
              <div className="flex items-center p-4 border-b border-gray-900 bg-black">
                  <button onClick={() => setActiveChatUser(null)} className="mr-4 text-xl"><i className="fas fa-arrow-left"></i></button>
                  <img src={activeChatUser.avatar_url || 'https://picsum.photos/50'} className="w-8 h-8 rounded-full mr-2 object-cover" />
                  <span className="font-bold flex items-center">
                      {activeChatUser.username}
                      {activeChatUser.verified && (
                          <div className="flex items-center justify-center w-3 h-3 bg-[#20D5EC] rounded-full ml-1">
                              <i className="fas fa-check text-white text-[7px] font-bold"></i>
                          </div>
                      )}
                  </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-4">
                  {messages.map(msg => {
                      const isMe = msg.sender_id === myId;
                      return (
                          <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${isMe ? 'bg-cyan-600 text-white rounded-tr-none' : 'bg-gray-800 text-white rounded-tl-none'}`}>
                                  {msg.content}
                              </div>
                          </div>
                      );
                  })}
                  <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendMessage} className="p-4 border-t border-gray-900 flex gap-2 bg-black pb-8">
                  <input 
                    type="text" 
                    value={newMessage} 
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Send a message..."
                    className="flex-1 bg-gray-900 rounded-full px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-pink-500 border border-gray-800"
                  />
                  <button type="submit" className="p-3 bg-gradient-to-r from-cyan-500 to-pink-500 rounded-full w-12 h-12 flex items-center justify-center shadow-lg">
                      <i className="fas fa-paper-plane text-white"></i>
                  </button>
              </form>
          </div>
      )}
    </div>
  );
};