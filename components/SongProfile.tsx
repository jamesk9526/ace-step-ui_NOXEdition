import React, { useState, useEffect } from 'react';
import { Song } from '../types';
import { songsApi, getAudioUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { ArrowLeft, Play, Pause, Heart, Share2, MoreHorizontal, ThumbsDown, Music as MusicIcon, Edit3, Eye } from 'lucide-react';
import { ShareModal } from './ShareModal';
import { SongDropdownMenu } from './SongDropdownMenu';

interface SongProfileProps {
    songId: string;
    onBack: () => void;
    onPlay: (song: Song, list?: Song[]) => void;
    onNavigateToProfile: (username: string) => void;
    currentSong?: Song | null;
    isPlaying?: boolean;
    likedSongIds?: Set<string>;
    onToggleLike?: (songId: string) => void;
    onDelete?: (song: Song) => void;
}

const updateMetaTags = (song: Song) => {
    const baseUrl = window.location.origin;
    const songUrl = `${baseUrl}/song/${song.id}`;
    const title = `${song.title} by ${song.creator || 'Unknown Artist'} | ACE-Step UI`;
    const description = `Listen to "${song.title}" - ${song.style}. ${song.viewCount || 0} plays, ${song.likeCount || 0} likes. Create your own AI music with ACE-Step UI.`;

    document.title = title;

    const updateOrCreateMeta = (selector: string, attribute: string, value: string) => {
        let element = document.querySelector(selector) as HTMLMetaElement;
        if (!element) {
            element = document.createElement('meta');
            const [attr, attrValue] = selector.replace(/[\[\]'"]/g, '').split('=');
            if (attr === 'property') element.setAttribute('property', attrValue);
            else if (attr === 'name') element.setAttribute('name', attrValue);
            document.head.appendChild(element);
        }
        element.setAttribute(attribute, value);
    };

    updateOrCreateMeta('meta[name="description"]', 'content', description);
    updateOrCreateMeta('meta[name="title"]', 'content', title);

    updateOrCreateMeta('meta[property="og:type"]', 'content', 'music.song');
    updateOrCreateMeta('meta[property="og:url"]', 'content', songUrl);
    updateOrCreateMeta('meta[property="og:title"]', 'content', title);
    updateOrCreateMeta('meta[property="og:description"]', 'content', description);
    updateOrCreateMeta('meta[property="og:image"]', 'content', song.coverUrl);
    updateOrCreateMeta('meta[property="og:image:width"]', 'content', '400');
    updateOrCreateMeta('meta[property="og:image:height"]', 'content', '400');
    updateOrCreateMeta('meta[property="og:audio"]', 'content', song.audioUrl || '');
    updateOrCreateMeta('meta[property="og:audio:type"]', 'content', 'audio/mpeg');

    updateOrCreateMeta('meta[name="twitter:card"]', 'content', 'summary_large_image');
    updateOrCreateMeta('meta[name="twitter:url"]', 'content', songUrl);
    updateOrCreateMeta('meta[name="twitter:title"]', 'content', title);
    updateOrCreateMeta('meta[name="twitter:description"]', 'content', description);
    updateOrCreateMeta('meta[name="twitter:image"]', 'content', song.coverUrl);

    updateOrCreateMeta('meta[property="music:duration"]', 'content', String(song.duration || 0));
    updateOrCreateMeta('meta[property="music:musician"]', 'content', song.creator || 'Unknown Artist');
};

const resetMetaTags = () => {
    document.title = 'ACE-Step UI - Local AI Music Generator';
    const defaultDescription = 'Create original music with AI locally. Generate songs in any style with custom lyrics and professional quality using ACE-Step.';
    const defaultImage = '/og-image.png';

    const updateMeta = (selector: string, content: string) => {
        const element = document.querySelector(selector) as HTMLMetaElement;
        if (element) element.setAttribute('content', content);
    };

    updateMeta('meta[name="description"]', defaultDescription);
    updateMeta('meta[property="og:title"]', 'ACE-Step UI - Local AI Music Generator');
    updateMeta('meta[property="og:description"]', defaultDescription);
    updateMeta('meta[property="og:image"]', defaultImage);
    updateMeta('meta[property="og:type"]', 'website');
    updateMeta('meta[name="twitter:title"]', 'ACE-Step UI - Local AI Music Generator');
    updateMeta('meta[name="twitter:description"]', defaultDescription);
    updateMeta('meta[name="twitter:image"]', defaultImage);
};

export const SongProfile: React.FC<SongProfileProps> = ({ songId, onBack, onPlay, onNavigateToProfile, currentSong, isPlaying, likedSongIds = new Set(), onToggleLike, onDelete }) => {
    const { user, token } = useAuth();
    const { t } = useI18n();
    const [song, setSong] = useState<Song | null>(null);
    const [loading, setLoading] = useState(true);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    const isCurrentSong = song && currentSong?.id === song.id;
    const isCurrentlyPlaying = isCurrentSong && isPlaying;
    const isLiked = song ? likedSongIds.has(song.id) : false;

    useEffect(() => {
        loadSongData();
        return () => resetMetaTags();
    }, [songId]);

    useEffect(() => {
        if (song) {
            updateMetaTags(song);
        }
    }, [song]);

    const loadSongData = async () => {
        setLoading(true);
        try {
            const response = await songsApi.getFullSong(songId, token);

            const transformedSong: Song = {
                id: response.song.id,
                title: response.song.title,
                lyrics: response.song.lyrics,
                style: response.song.style,
                coverUrl: `https://picsum.photos/seed/${response.song.id}/400/400`,
                duration: response.song.duration
                    ? `${Math.floor(response.song.duration / 60)}:${String(Math.floor(response.song.duration % 60)).padStart(2, '0')}`
                    : '0:00',
                createdAt: new Date(response.song.created_at),
                tags: response.song.tags || [],
                audioUrl: getAudioUrl(response.song.audio_url, response.song.id),
                isPublic: response.song.is_public,
                likeCount: response.song.like_count || 0,
                viewCount: response.song.view_count || 0,
                userId: response.song.user_id,
                creator: response.song.creator,
                creator_avatar: response.song.creator_avatar,
            };

            setSong(transformedSong);
        } catch (error) {
            console.error('Failed to load song:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-zinc-50 dark:bg-black">
                <div className="text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                    {t('loadingSong')}
                </div>
            </div>
        );
    }

    if (!song) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-gradient-to-b from-black via-zinc-950 to-black dark:from-black dark:via-zinc-950 dark:to-black animate-fade-in">
                <div className="text-zinc-400 text-lg">{t('songNotFound')}</div>
                <button onClick={onBack} className="px-6 py-2.5 bg-green-500 hover:bg-green-400 text-white rounded-full text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-green-500/50">
                    {t('goBack')}
                </button>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col bg-gradient-to-b from-black via-zinc-950 to-black dark:from-black dark:via-zinc-950 dark:to-black overflow-hidden">
            {/* Header */}
            <div className="border-b border-zinc-800/50 px-4 md:px-8 py-6 flex-shrink-0 backdrop-blur-sm bg-black/40 animate-fade-in">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors duration-200 group"
                >
                    <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="font-medium">{t('back')}</span>
                </button>

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex-1 max-w-4xl">
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent mb-3 leading-tight">{song.title}</h1>
                        <div className="flex items-center gap-4 mb-5">
                            <div
                                onClick={() => song.creator && onNavigateToProfile(song.creator)}
                                className="flex items-center gap-3 cursor-pointer group hover:scale-105 transition-transform"
                            >
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-xs font-bold text-white overflow-hidden shadow-lg">
                                    {song.creator_avatar ? (
                                        <img src={song.creator_avatar} alt={song.creator || 'Creator'} className="w-full h-full object-cover" />
                                    ) : (
                                        song.creator ? song.creator[0].toUpperCase() : 'A'
                                    )}
                                </div>
                                <span className="text-white font-semibold group-hover:text-green-400 transition-colors">{song.creator || 'Anonymous'}</span>
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mb-4">
                            {song.style.split(',').slice(0, 4).map((tag, i) => (
                                <span key={i} className="px-3 py-1 bg-gradient-to-r from-green-500/20 to-emerald-600/20 border border-green-500/30 rounded-full text-xs text-green-300 font-medium hover:border-green-400/50 transition-colors duration-200" style={{
                                    animation: `fadeIn ${0.3 + i * 0.1}s ease-out`
                                }}>
                                    {tag.trim()}
                                </span>
                            ))}
                        </div>

                        <div className="text-xs text-zinc-500 font-medium">
                            {new Date(song.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at {new Date(song.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            {!song.isPublic && song.userId === user?.id && (
                                <span className="ml-3 px-2.5 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-full text-yellow-300 font-semibold">Private</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-10 pb-24 lg:pb-32">
                    {/* Left Column: Song Details */}
                    <div className="space-y-8 md:space-y-10 animate-fade-in" style={{ animationDelay: '0.1s' }}>
                        {/* Cover Art with Enhanced Styling */}
                        <div className="relative aspect-square max-w-sm mx-auto lg:mx-0 rounded-2xl overflow-hidden shadow-2xl group cursor-pointer hover:shadow-2xl hover:shadow-green-500/20 transition-all duration-300">
                            <img 
                                src={song.coverUrl} 
                                alt={song.title} 
                                className={`w-full h-full object-cover transition-all duration-500 ${
                                    isCurrentlyPlaying ? 'scale-110' : 'group-hover:scale-105'
                                }`} 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <button
                                onClick={() => onPlay(song)}
                                className={`absolute inset-0 transition-all flex items-center justify-center group/btn ${
                                    isCurrentSong ? 'bg-black/50' : 'bg-black/30 hover:bg-black/50'
                                }`}
                            >
                                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 group-hover/btn:scale-110 transition-all duration-300 flex items-center justify-center shadow-2xl shadow-green-500/50 group-hover/btn:shadow-green-400/60">
                                    {isCurrentlyPlaying ? (
                                        <Pause size={32} className="text-white fill-white" />
                                    ) : (
                                        <Play size={32} className="text-white fill-white ml-1" />
                                    )}
                                </div>
                            </button>
                            {isCurrentlyPlaying && (
                                <div className="absolute bottom-6 left-6 flex items-center gap-1.5">
                                    <span className="w-1.5 h-4 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1.5 h-6 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1.5 h-3 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                                    <span className="w-1.5 h-7 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '450ms' }} />
                                </div>
                            )}
                        </div>

                        {/* Action Buttons - Premium Styling */}
                        <div className="flex items-center justify-center lg:justify-start gap-3 flex-wrap" style={{
                            animation: `fadeInUp 0.5s ease-out 0.2s both`
                        }}>
                            <div className="flex items-center gap-2.5 bg-gradient-to-r from-zinc-900/80 to-black/80 backdrop-blur-sm px-4 py-2.5 rounded-full text-sm border border-zinc-800/50 hover:border-green-500/30 transition-all duration-200">
                                <Eye size={16} className="text-green-400" />
                                <span className="text-white font-semibold">{song.viewCount || 0}</span>
                            </div>
                            <button
                                onClick={() => onToggleLike?.(song.id)}
                                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-full text-sm transition-all duration-200 font-semibold backdrop-blur-sm border ${
                                    isLiked 
                                        ? 'bg-gradient-to-r from-pink-500 to-red-500 text-white border-pink-500/50 hover:shadow-lg hover:shadow-pink-500/50' 
                                        : 'bg-gradient-to-r from-zinc-900/80 to-black/80 text-white border-zinc-800/50 hover:border-green-500/30 hover:bg-zinc-800/50'
                                }`}
                            >
                                <Heart size={16} className={isLiked ? 'fill-current' : ''} />
                                <span>{song.likeCount || 0}</span>
                            </button>
                            {user?.id === song.userId && (
                                <button
                                    onClick={() => {
                                        if (!song.audioUrl) return;
                                        const audioUrl = song.audioUrl.startsWith('http') ? song.audioUrl : `${window.location.origin}${song.audioUrl}`;
                                        window.open(`/editor?audioUrl=${encodeURIComponent(audioUrl)}`, '_blank');
                                    }}
                                    className="flex items-center gap-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 text-white hover:shadow-lg hover:shadow-green-500/50 border border-green-400/30"
                                >
                                    <Edit3 size={16} />
                                    <span className="hidden md:inline">Edit</span>
                                </button>
                            )}
                            <button
                                onClick={() => setShareModalOpen(true)}
                                className="p-2.5 bg-gradient-to-r from-zinc-900/80 to-black/80 backdrop-blur-sm hover:bg-zinc-800/80 rounded-full transition-all duration-200 border border-zinc-800/50 hover:border-green-500/30 group"
                            >
                                <Share2 size={16} className="text-zinc-300 group-hover:text-green-400 transition-colors" />
                            </button>
                            <div className="relative">
                                <button
                                    onClick={() => setShowDropdown(!showDropdown)}
                                    className="p-2.5 bg-gradient-to-r from-zinc-900/80 to-black/80 backdrop-blur-sm hover:bg-zinc-800/80 rounded-full transition-all duration-200 border border-zinc-800/50 hover:border-green-500/30 group"
                                >
                                    <MoreHorizontal size={16} className="text-zinc-300 group-hover:text-green-400 transition-colors" />
                                </button>
                                {song && (
                                    <SongDropdownMenu
                                        song={song}
                                        isOpen={showDropdown}
                                        onClose={() => setShowDropdown(false)}
                                        isOwner={user?.id === song.userId}
                                        onReusePrompt={() => {}}
                                        onAddToPlaylist={() => {}}
                                        onDelete={() => onDelete?.(song)}
                                        onShare={() => setShareModalOpen(true)}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Lyrics - Premium Card */}
                        {song.lyrics && (
                            <div 
                                className="bg-gradient-to-br from-zinc-900/50 to-black/50 border border-zinc-800/50 hover:border-green-500/30 rounded-2xl p-6 md:p-8 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10" 
                                style={{
                                    animation: `fadeInUp 0.6s ease-out 0.3s both`
                                }}
                            >
                                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                                    <MusicIcon size={18} className="text-green-400" />
                                    Lyrics
                                </h3>
                                <div className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed max-h-96 overflow-y-auto prose prose-invert">
                                    {song.lyrics}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>

            {song && (
                <ShareModal
                    isOpen={shareModalOpen}
                    onClose={() => setShareModalOpen(false)}
                    song={song}
                />
            )}
        </div>
    );
};
