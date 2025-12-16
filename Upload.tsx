import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export const Upload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const navigate = useNavigate();

  const checkDuration = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = function() {
        window.URL.revokeObjectURL(video.src);
        // Limit: 2 minutes 50 seconds = 170 seconds
        if (video.duration > 170) {
          reject("Video is too long. Max duration is 2 minutes 50 seconds.");
        } else {
          resolve();
        }
      };
      video.onerror = () => reject("Invalid video file.");
      video.src = URL.createObjectURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      try {
        await checkDuration(selectedFile);
        setFile(selectedFile);
      } catch (err: any) {
        alert(err);
        e.target.value = ''; // Reset input
        setFile(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a video first.");
      return;
    }
    if (!caption) {
      alert("Please add a caption.");
      return;
    }

    setUploading(true);

    try {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("You must be logged in to upload.");

      // 1. Upload file
      const fileExt = file.name.split('.').pop();
      // Sanitize filename
      const safeFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      // STRICTLY follow the policy: bucket/userId/filename
      const filePath = `${user.id}/${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(filePath, file);

      if (uploadError) {
         console.error("Storage upload failed:", uploadError);
         let msg = uploadError.message;
         if (msg.includes("Bucket not found") || msg.includes("row-level security")) {
             msg += "\n\nCRITICAL: You must run the SQL setup script to create the 'videos' bucket and policies.";
         }
         throw new Error(msg);
      }

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('videos')
        .getPublicUrl(filePath);

      // 3. Insert into Database
      const { error: dbError } = await supabase.from('videos').insert({
        user_id: user.id,
        video_url: publicUrl,
        description: caption,
        views_count: 0,
        likes_count: 0
      });

      if (dbError) {
         console.error("Database insert failed:", dbError);
         throw new Error(`Database error: ${dbError.message}`);
      }

      // 4. Redirect to Profile so user sees their video
      navigate('/profile');
      
    } catch (error: any) {
      console.error(error);
      alert("Upload Error: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="h-screen bg-black text-white p-6 flex flex-col pb-20">
      <h2 className="text-xl font-bold mb-6 text-center">Upload Video</h2>

      <div className="flex-1 flex flex-col gap-6">
        <div className="border-2 border-dashed border-gray-700 rounded-xl h-64 flex flex-col items-center justify-center bg-gray-900 overflow-hidden relative">
          {file ? (
            <div className="text-center w-full h-full flex flex-col items-center justify-center p-4">
              <i className="fas fa-file-video text-4xl text-pink-500 mb-2"></i>
              <p className="text-sm truncate max-w-full">{file.name}</p>
              <button onClick={() => setFile(null)} className="text-red-500 text-xs mt-2 z-10 px-4 py-2 bg-gray-800 rounded">
                 Change Video
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center cursor-pointer p-8 w-full h-full justify-center">
              <i className="fas fa-cloud-upload-alt text-4xl text-cyan-400 mb-2"></i>
              <span>Select Video</span>
              <span className="text-xs text-gray-500 mt-2">Max duration: 2m 50s</span>
              <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
            </label>
          )}
        </div>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Describe your video... #hashtag"
          className="w-full bg-gray-800 rounded-xl p-4 text-white focus:outline-none focus:ring-1 focus:ring-pink-500 h-32"
        />

        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
            uploading || !file 
            ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
            : 'bg-gradient-to-r from-blue-500 to-pink-500 text-white shadow-lg shadow-cyan-500/20'
          }`}
        >
          {uploading ? (
             <span className="flex items-center justify-center gap-2">
                 <i className="fas fa-spinner fa-spin"></i> Uploading...
             </span>
          ) : 'Post'}
        </button>
      </div>
    </div>
  );
};