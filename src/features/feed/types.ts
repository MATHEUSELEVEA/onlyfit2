export interface FeedAuthor {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  verified: boolean;
}

export interface FeedProduct {
  id: string;
  title: string;
}

export interface FeedPost {
  id: string;
  author: FeedAuthor;
  caption: string;
  mediaUrl: string | null;
  mediaType: 'image' | 'video';
  likeCount: number;
  commentCount: number;
  createdAt: string;
  product: FeedProduct | null;
}
