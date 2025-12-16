import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

// Components are now in the root folder
import AuthScreen from './AuthScreen';
import BottomNav from './BottomNav';

// Pages still in the pages folder
import Home from './pages/Home';
import Discover from './pages/Discover';
import Upload from './pages/Upload';
import Inbox from './pages/Inbox';
import Profile from './pages/Profile';
import VideoView from './pages/VideoView';
import SqlSetup from './pages/SqlSetup';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkSession = async () => {
    try {
      setConnectionError(null);
      if (!navigator.onLine) throw new Error("You are offline.");

      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.warn("Session check failed (non-critical):", error);
        setSession(null);
      } else {
        if (data.session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_banned')
            .eq('id', data.session.user.id)
            .single();
          if (profile?.is_banned) {
            await supabase.auth.signOut();
            setSession(null);
            alert("Your account has been banned.");
          } else setSession(data.session);
        } else setSession(null);
      }
    } catch (err: any) {
      console.error("Session check critical failure:", err);
      setConnectionError(err.message || "Unknown connection error");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setLoading(true);
    setConnectionError(null);
    setTimeout(() => checkSession(), 1000);
  };

  if (loading) {
    return (
      <div className="h-screen w-full bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="h-screen w-full bg-black flex flex-col items-center justify-center p-6 text-center">
        <i className="fas fa-wifi text-4xl text-red-500 mb-4"></i>
        <h2 className="text-xl font-bold mb-2">Connection Error</h2>
        <p className="text-gray-400 mb-6 text-sm break-words max-w-xs">
          {connectionError}
          <br />
          <span className="text-xs text-gray-500 mt-2 block">
            Please check your internet connection.
          </span>
        </p>
        <button
          onClick={handleRetry}
          className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-pink-600 rounded-full font-bold hover:opacity-90 transition-all shadow-lg shadow-pink-900/20"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <Router>
      <div className="w-full h-screen bg-black overflow-hidden flex flex-col">
        <div className="flex-1 overflow-hidden relative z-0">
          <Routes>
            <Route path="/sql-setup" element={<SqlSetup />} />

            {session ? (
              <>
                <Route path="/" element={<Home />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/profile/:userId" element={<Profile />} />
                <Route path="/video/:videoId" element={<VideoView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            ) : (
              <Route path="*" element={<AuthScreen />} />
            )}
          </Routes>
        </div>
        {session && <BottomNav />}
      </div>
    </Router>
  );
}

