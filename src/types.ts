export interface ImageRecord {
  id: string;
  name: string;
  size: number;
  mime: string;
  width: number | null;
  height: number | null;
  description: string;
  tags: string[];
  albumId: string | null;
  createdAt: string;
  url: string;
  originalUrl?: string;
  deletedAt?: string | null;
  favorite?: boolean;
  purgeStarted?: boolean;
  thumbnailUrl: string;
}
export interface AlbumRecord {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  imageCount: number;
  coverUrl: string | null;
}
export type Stats = {
  totalImages: number;
  totalAlbums: number;
  totalBytes: number;
};
