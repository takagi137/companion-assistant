// IDs verified against Apple's JP catalogue, 2026-10-16. Playback stays with Apple.
export const BLUE_ARCHIVE_TRACKS = [
  [1613862587,1613862586,'Constant Moderato','ミツキヨ'],
  [1697258769,1697258767,'Unwelcome School','ミツキヨ'],
  [1665015455,1665013930,'RE Aoharu','Nor'],
  [1757552517,1757552513,'Usagi Flap','Nor'],
].map(([trackId,collectionId,title,artist])=>{
  const path=`/jp/album/${encodeURIComponent(title)}/${collectionId}?i=${trackId}`;
  return {id:`JP-${trackId}`,title,artist,country:'JP',note:'碧蓝档案 · 原声音乐',url:`https://music.apple.com${path}`,embedUrl:`https://embed.music.apple.com${path}&theme=light`,preview:true};
});
