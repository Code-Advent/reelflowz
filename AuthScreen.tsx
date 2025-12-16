import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

const AuthScreen = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!navigator.onLine) {
        throw new Error("You are offline. Please check your internet connection.");
      }

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      let msg = err.message || "An unexpected error occurred.";
      if (msg.includes("Failed to fetch") || msg.includes("Load failed")) {
        msg = "Connection error. Please check your internet connection and try again.";
      } else if (msg.includes("Invalid login credentials")) {
        msg = "Incorrect email or password. Please try again.";
      } else if (msg.includes("User already registered")) {
        msg = "This email is already registered. Please log in.";
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col justify-center items-center bg-black p-6 relative">
      {/* App Icon */}
      <div className="mb-8 flex flex-col items-center">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-600 to-pink-600 flex items-center justify-center shadow-lg shadow-pink-500/20 mb-4">
          <svg width="50" height="50" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 5V19L19 12L8 5Z" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-pink-500 text-transparent bg-clip-text">
          Reelflow
        </h1>
        <p className="text-gray-500 text-xs mt-2">The future of streaming</p>
      </div>

      <form onSubmit={handleAuth} className="w-full max-w-sm space-y-4">
        <input
          type="email"
          placeholder="Email"
          className="w-full bg-gray-900 text-white p-4 rounded-xl border border-gray-800 focus:border-cyan-400 focus:outline-none transition-colors"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full bg-gray-900 text-white p-4 rounded-xl border border-gray-800 focus:border-cyan-400 focus:outline-none transition-colors"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="text-red-500 text-sm text-center bg-red-900/20 p-2 rounded border border-red-900">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full p-4 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-pink-600 hover:opacity-90 transition-all shadow-lg shadow-blue-900/20"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <i className="fas fa-spinner fa-spin"></i> Processing...
            </span>
          ) : isLogin ? 'Log In' : 'Sign Up'}
        </button>
      </form>

      <div className="mt-6 flex gap-2 text-sm">
        <span className="text-gray-500">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
        </span>
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="text-cyan-400 font-bold hover:text-cyan-300"
        >
          {isLogin ? 'Sign up' : 'Log in'}
        </button>
      </div>
    </div>
  );
};

export default AuthScreen;
