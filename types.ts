export interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  verified?: boolean;
  is_admin?: boolean;
  is_banned?: boolean;
}

export interface Video {
  id: string;
  user_id: string;
  video_url: string;
  description: string;
  views_count: number;
  likes_count: number;
  shares_count: number;
  comments_count: number;
  created_at: string;
  pinned?: boolean;
  profiles?: Profile; // Joined data
  liked_by_viewer?: boolean; // Virtual field
}

export interface Story {
  id: string;
  user_id: string;
  video_url: string;
  created_at: string;
  expires_at: string;
  profiles?: Profile;
}

export interface Comment {
  id: string;
  video_id: string;
  user_id: string;
  text: string;
  created_at: string;
  profiles?: Profile;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  sender?: Profile;   // Joined manually or via query
  receiver?: Profile; // Joined manually or via query
}

export interface Conversation {
  other_user: Profile;
  last_message: Message;
}