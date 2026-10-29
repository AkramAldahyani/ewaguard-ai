import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

export function CommunityImagePicker({ options, disabled, onChange }) {
  const [previews, setPreviews] = useState([]), [error, setError] = useState('');
  const ownedUrls = useRef(new Set());
  useEffect(() => { const urls = ownedUrls.current; return () => { urls.forEach((url) => URL.revokeObjectURL(url)); urls.clear(); }; }, []);
  function choose(event) {
    const files = Array.from(event.target.files ?? []); event.target.value = '';
    if (!files.length) return;
    if (files.length + previews.length > options.maxImages) { setError(`Choose up to ${options.maxImages} images per post.`); return; }
    if (files.some((file) => !options.formats.includes(file.type) || !/\.(?:jpe?g|png|webp)$/i.test(file.name) || !file.size || file.size > options.maxBytes)) {
      setError(`Choose JPG, PNG, or WebP images up to ${options.maxBytes / 1048576} MiB each. Videos and animated images are not supported here.`); return;
    }
    const next = [...previews, ...files.map((file) => { const url = URL.createObjectURL(file); ownedUrls.current.add(url); return { file, url }; })];
    setPreviews(next); setError(''); onChange(next.map((item) => item.file));
  }
  function remove(url) {
    URL.revokeObjectURL(url); ownedUrls.current.delete(url);
    const next = previews.filter((item) => item.url !== url); setPreviews(next); setError(''); onChange(next.map((item) => item.file));
  }
  return <section aria-label="Post images">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label className={`community-image-picker ${disabled || !options ? 'opacity-50' : ''}`}><ImagePlus className="size-4" aria-hidden="true" />Add photos<input type="file" className="sr-only" aria-label="Add photos" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || !options} onChange={choose} /></label>
      {options && <p className="text-xs text-slate-500">Up to {options.maxImages} photos · {options.maxBytes / 1048576} MiB each</p>}
    </div>
    {previews.length > 0 && <div className="community-image-grid mt-3">{previews.map((item, index) => <div key={item.url} className="relative overflow-hidden rounded-xl bg-slate-100"><img src={item.url} alt={`Selected photo ${index + 1}`} className="h-40 w-full object-contain" /><button type="button" aria-label={`Remove photo ${index + 1}`} disabled={disabled} onClick={() => remove(item.url)} className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-white text-slate-800 shadow-sm"><X className="size-4" aria-hidden="true" /></button></div>)}</div>}
    {error && <p role="alert" className="mt-2 text-sm text-danger-700">{error}</p>}
  </section>;
}
