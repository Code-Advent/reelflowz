import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getIconClass = (path: string) => {
    return location.pathname === path ? "text-white" : "text-gray-500";
  };

  return (
    <div className="fixed bottom-0 left-0 w-full h-16 bg-black border-t border-gray-800 flex justify-between items-center px-4 z-40">
      <button 
        onClick={() => navigate('/')} 
        className={`flex flex-col items-center w-12 focus:outline-none ${getIconClass('/')}`}
      >
        <i className="fas fa-home text-xl mb-1"></i>
        <span className="text-[10px] font-bold">Home</span>
      </button>

      <button 
        onClick={() => navigate('/discover')} 
        className={`flex flex-col items-center w-12 focus:outline-none ${getIconClass('/discover')}`}
      >
        <i className="fas fa-compass text-xl mb-1"></i>
        <span className="text-[10px] font-bold">Discover</span>
      </button>

      {/* Center Upload Button */}
      <button 
        onClick={() => navigate('/upload')} 
        className="relative flex items-center justify-center w-14 h-10 focus:outline-none"
      >
        <div className="absolute left-0 w-10 h-8 bg-cyan-400 rounded-lg transform -translate-x-1"></div>
        <div className="absolute right-0 w-10 h-8 bg-pink-500 rounded-lg transform translate-x-1"></div>
        <div className="absolute w-10 h-8 bg-white rounded-lg flex items-center justify-center z-10">
          <i className="fas fa-plus text-black font-bold"></i>
        </div>
      </button>

      <button 
        onClick={() => navigate('/inbox')} 
        className={`flex flex-col items-center w-12 focus:outline-none ${getIconClass('/inbox')}`}
      >
        <i className="fas fa-comment-alt text-xl mb-1"></i>
        <span className="text-[10px] font-bold">Inbox</span>
      </button>

      <button 
        onClick={() => navigate('/profile')} 
        className={`flex flex-col items-center w-12 focus:outline-none ${getIconClass('/profile')}`}
      >
        <i className="fas fa-user text-xl mb-1"></i>
        <span className="text-[10px] font-bold">Profile</span>
      </button>
    </div>
  );
};