import { useState } from 'react';
import { Modal } from '../../components/ui/Dialog.jsx';
import './community.css';

export function CommunityImages({ images = [], admin = false, onLoaded }) {
  const [selected, setSelected] = useState(null), [failed, setFailed] = useState([]);
  if (!images.length) return null;
  const url = (id) => `/api/${admin ? 'admin/' : ''}community/media/${encodeURIComponent(id)}`;
  return <div className="mt-5">
    <div className={`community-image-grid ${images.length === 1 ? 'community-image-single' : ''}`}>
      {images.map((image, index) => <div key={image.id}>
        {!image.available || failed.includes(image.id) ? <p className="rounded-xl bg-slate-100 p-6 text-center text-sm text-slate-600">Image unavailable or awaiting security validation.</p> :
          <button type="button" className="community-image-open" aria-label={`Enlarge photo ${index + 1}`} onClick={() => setSelected(image.id)}>
            <img src={url(image.id)} alt={`Community photo ${index + 1}`} width={image.width ?? undefined} height={image.height ?? undefined} loading={admin ? 'eager' : 'lazy'} decoding="async"
              onLoad={() => onLoaded?.(image.id)} onError={() => setFailed((current) => [...current, image.id])} />
          </button>}
        {admin && <p className="mt-2 text-xs leading-5 text-slate-600">Validation: {image.validationStatus}. ClamAV: {image.clamavStatus}. YARA: {image.yaraStatus}.</p>}
      </div>)}
    </div>
    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Community photo">
      {selected && !failed.includes(selected) && <img src={url(selected)} alt="Expanded community photo" className="max-h-[70vh] w-full object-contain" onError={() => setFailed((current) => [...current, selected])} />}
      {selected && failed.includes(selected) && <p role="status">This image is no longer available.</p>}
    </Modal>
  </div>;
}

export function CommunityImageReview({ images, onReview }) {
  const [loaded, setLoaded] = useState([]);
  const ready = images.every((image) => image.available && loaded.includes(image.id));
  return <section className="mt-5" aria-label="Image security review">
    <h4 className="font-semibold text-navy-900">Review attached photos</h4>
    <CommunityImages images={images} admin onLoaded={(id) => setLoaded((current) => current.includes(id) ? current : [...current, id])} />
    <p className="mt-3 text-xs leading-5 text-slate-600">No known detection is not a guarantee of safety. Review the images for confidential information and suitability before approval.</p>
    <label className="mt-3 flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 accent-brand-600" disabled={!ready} onChange={(event) => onReview(event.target.checked ? images.map((image) => image.id) : [])} />I have reviewed every attached photo for publication.</label>
  </section>;
}
