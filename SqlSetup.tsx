import React from 'react';
import { useNavigate } from 'react-router-dom';

export const SqlSetup = () => {
  const navigate = useNavigate();
  const sqlCode = `-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- 2. Create PROFILES Table
create table if not exists public.profiles (
  id uuid references auth.users not null primary key,
  username text unique,
  avatar_url text,
  bio text,
  followers_count integer default 0,
  following_count integer default 0,
  verified boolean default false,
  is_admin boolean default false,
  is_banned boolean default false,
  updated_at timestamp with time zone
);

-- 3. Create VIDEOS Table
create table if not exists public.videos (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  video_url text not null,
  description text,
  views_count integer default 0,
  likes_count integer default 0,
  shares_count integer default 0,
  comments_count integer default 0,
  pinned boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- IMPORTANT: Add pinned column if it doesn't exist (for existing tables)
alter table public.videos add column if not exists pinned boolean default false;
alter table public.profiles add column if not exists is_banned boolean default false;
alter table public.profiles add column if not exists is_admin boolean default false;

-- 4. Create STORIES Table
create table if not exists public.stories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  video_url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone default timezone('utc'::text, now() + interval '24 hours') not null
);

-- 5. Create LIKES Table with UNIQUE constraint
create table if not exists public.likes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  video_id uuid references public.videos(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, video_id)
);

-- 6. Create COMMENTS Table
create table if not exists public.comments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  video_id uuid references public.videos(id) not null,
  text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Create FOLLOWS Table
create table if not exists public.follows (
  id uuid default uuid_generate_v4() primary key,
  follower_id uuid references public.profiles(id) not null,
  following_id uuid references public.profiles(id) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(follower_id, following_id)
);

-- 8. Create MESSAGES Table
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references public.profiles(id) not null,
  receiver_id uuid references public.profiles(id) not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 9. Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.stories enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.messages enable row level security;

-- Policies
drop policy if exists "Public profiles are viewable by everyone." on public.profiles;
create policy "Public profiles are viewable by everyone." on public.profiles for select using (true);

drop policy if exists "Users can insert their own profile." on public.profiles;
create policy "Users can insert their own profile." on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile." on public.profiles;
create policy "Users can update own profile." on public.profiles for update using (auth.uid() = id);

drop policy if exists "Videos are viewable by everyone." on public.videos;
create policy "Videos are viewable by everyone." on public.videos for select using (true);

drop policy if exists "Users can insert their own videos." on public.videos;
create policy "Users can insert their own videos." on public.videos for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own videos." on public.videos;
create policy "Users can delete own videos." on public.videos for delete using (auth.uid() = user_id);

drop policy if exists "Users can update own videos (pinning)." on public.videos;
create policy "Users can update own videos (pinning)." on public.videos for update using (auth.uid() = user_id);

-- Story Policies
drop policy if exists "Stories viewable by everyone" on public.stories;
create policy "Stories viewable by everyone" on public.stories for select using (expires_at > timezone('utc'::text, now()));

drop policy if exists "Users can insert own stories" on public.stories;
create policy "Users can insert own stories" on public.stories for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own stories" on public.stories;
create policy "Users can delete own stories" on public.stories for delete using (auth.uid() = user_id);


drop policy if exists "Likes are viewable by everyone." on public.likes;
create policy "Likes are viewable by everyone." on public.likes for select using (true);

drop policy if exists "Users can insert likes." on public.likes;
create policy "Users can insert likes." on public.likes for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own likes." on public.likes;
create policy "Users can delete own likes." on public.likes for delete using (auth.uid() = user_id);

drop policy if exists "Comments are viewable by everyone." on public.comments;
create policy "Comments are viewable by everyone." on public.comments for select using (true);

drop policy if exists "Users can insert comments." on public.comments;
create policy "Users can insert comments." on public.comments for insert with check (auth.uid() = user_id);

drop policy if exists "Follows are viewable by everyone." on public.follows;
create policy "Follows are viewable by everyone." on public.follows for select using (true);

drop policy if exists "Users can follow." on public.follows;
create policy "Users can follow." on public.follows for insert with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow." on public.follows;
create policy "Users can unfollow." on public.follows for delete using (auth.uid() = follower_id);

drop policy if exists "Users can see their own messages." on public.messages;
create policy "Users can see their own messages." on public.messages for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "Users can insert messages." on public.messages;
create policy "Users can insert messages." on public.messages for insert with check (auth.uid() = sender_id);

-- 10. Storage Buckets
insert into storage.buckets (id, name, public) values ('videos', 'videos', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;

drop policy if exists "Videos Public" on storage.objects;
create policy "Videos Public" on storage.objects for select using ( bucket_id = 'videos' );

drop policy if exists "Videos Upload" on storage.objects;
create policy "Videos Upload" on storage.objects for insert with check ( bucket_id = 'videos' and auth.uid()::text = (storage.foldername(name))[1] );

drop policy if exists "Avatars Public" on storage.objects;
create policy "Avatars Public" on storage.objects for select using ( bucket_id = 'avatars' );

drop policy if exists "Avatars Upload" on storage.objects;
create policy "Avatars Upload" on storage.objects for insert with check ( bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1] );

-- 11. RPC Functions (Counters)

create or replace function increment_view_count(video_id_input uuid)
returns void as $$
begin
  update public.videos
  set views_count = views_count + 1
  where id = video_id_input;
end;
$$ language plpgsql security definer;

create or replace function increment_like_count(video_id_input uuid)
returns void as $$
begin
  update public.videos
  set likes_count = likes_count + 1
  where id = video_id_input;
end;
$$ language plpgsql security definer;

create or replace function decrement_like_count(video_id_input uuid)
returns void as $$
begin
  update public.videos
  set likes_count = greatest(0, likes_count - 1)
  where id = video_id_input;
end;
$$ language plpgsql security definer;

create or replace function increment_share_count(video_id_input uuid)
returns void as $$
begin
  update public.videos
  set shares_count = shares_count + 1
  where id = video_id_input;
end;
$$ language plpgsql security definer;

-- 12. RPC Functions (Admin & User Actions)

create or replace function boost_video_stats(video_id_input uuid, views_add int, likes_add int)
returns void as $$
begin
  update public.videos
  set 
    views_count = greatest(0, views_count + views_add),
    likes_count = greatest(0, likes_count + likes_add)
  where id = video_id_input;
end;
$$ language plpgsql security definer;

create or replace function boost_profile_followers(user_id_input uuid, followers_add int)
returns void as $$
begin
  update public.profiles
  set followers_count = greatest(0, followers_count + followers_add)
  where id = user_id_input;
end;
$$ language plpgsql security definer;

create or replace function set_user_verified(user_id_input uuid, status boolean)
returns void as $$
begin
  update public.profiles
  set verified = status
  where id = user_id_input;
end;
$$ language plpgsql security definer;

create or replace function ban_user(user_id_input uuid, ban_status boolean)
returns void as $$
begin
  update public.profiles
  set is_banned = ban_status
  where id = user_id_input;
end;
$$ language plpgsql security definer;

create or replace function delete_own_account()
returns void as $$
declare
  requesting_user_id uuid;
begin
  requesting_user_id := auth.uid();
  
  -- Delete dependent data first
  delete from public.likes where user_id = requesting_user_id;
  delete from public.comments where user_id = requesting_user_id;
  delete from public.follows where follower_id = requesting_user_id or following_id = requesting_user_id;
  delete from public.messages where sender_id = requesting_user_id or receiver_id = requesting_user_id;
  delete from public.videos where user_id = requesting_user_id;
  delete from public.stories where user_id = requesting_user_id;
  delete from public.profiles where id = requesting_user_id;
end;
$$ language plpgsql security definer;

-- 13. Triggers
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url, bio)
  values (new.id, 'user_' || substr(new.id::text, 1, 8), 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || new.id, '');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlCode);
    alert("SQL copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 pb-20 overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 flex items-center gap-2 hover:text-white transition-colors">
          <i className="fas fa-arrow-left"></i> Back
        </button>
        <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-pink-500">
          Database Setup
        </h1>
      </div>
      
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-6 rounded-xl border border-gray-700 mb-8 shadow-lg">
        <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                <i className="fas fa-database text-cyan-400"></i>
            </div>
            <div>
                <h2 className="font-bold text-lg mb-1">Update SQL Script</h2>
                <p className="text-gray-400 text-sm">
                    Added <strong>Stories</strong> table and policies.
                    <span className="text-green-400 block mt-1"><i className="fas fa-check-circle mr-1"></i> Run this to enable Stories.</span>
                </p>
            </div>
        </div>

        <ol className="list-decimal list-inside text-sm text-gray-300 space-y-3 bg-black/20 p-4 rounded-lg border border-gray-700/50">
          <li>Open your <a href="https://supabase.com/dashboard" target="_blank" className="text-blue-400 hover:text-blue-300 font-bold">Supabase Dashboard <i className="fas fa-external-link-alt text-xs ml-1"></i></a></li>
          <li>Navigate to the <strong>SQL Editor</strong> <i className="fas fa-terminal text-xs mx-1"></i>.</li>
          <li>Paste the code below and click <strong className="text-green-400">Run</strong>.</li>
        </ol>
      </div>

      <div className="relative group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600 to-pink-600 rounded-xl opacity-50 blur group-hover:opacity-75 transition duration-200"></div>
        <div className="relative bg-[#1e1e1e] rounded-xl border border-gray-800 p-1 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-2 border-b border-gray-800 bg-[#252526]">
            <span className="text-xs text-gray-400 font-mono flex items-center gap-2">
                <i className="fas fa-code"></i> schema.sql
            </span>
            <button 
                onClick={copyToClipboard}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-4 py-2 rounded-md font-bold shadow-lg flex items-center gap-2 transition-all transform active:scale-95"
            >
                <i className="fas fa-copy"></i> Copy SQL
            </button>
            </div>
            <textarea 
                readOnly
                className="w-full h-[50vh] bg-[#1e1e1e] text-green-400 font-mono text-xs p-4 focus:outline-none resize-none custom-scrollbar"
                value={sqlCode}
            />
        </div>
      </div>
    </div>
  );
};