import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Send, ShieldCheck } from 'lucide-react';
import { DISCLAIMER_DEFINITION } from '../../../../shared/disclaimer.js';
import { Button, Input, Select, Textarea } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { CommunityAvatar } from './CommunityPostCard.jsx';
import { categories, communityError, label, validateCommunityPost } from './community-model.js';
import { CommunityImagePicker } from './CommunityImagePicker.jsx';
import { uploadCommunityImages } from './community-image-upload.js';

const emptyPost = { title: '', category: '', body: '' };

export function CommunityComposer({ open, onClose, onSubmitted, api, name }) {
  const [post, setPost] = useState(emptyPost);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const uploadController = useRef(null);
  const [images, setImages] = useState([]),
    [pickerVersion, setPickerVersion] = useState(0);
  const [options, setOptions] = useState(null),
    [optionsError, setOptionsError] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => () => uploadController.current?.abort(), []);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    api
      .mediaOptions(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setOptions(result);
          setOptionsError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setOptionsError(true);
      });
    return () => controller.abort();
  }, [api, open]);
  const update = (field) => (event) => setPost((value) => ({ ...value, [field]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const validation = validateCommunityPost(post, acknowledged, images.length > 0);
    if (validation) {
      setError(validation);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    setProgress(0);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const { acknowledgement } = await api.acknowledge(controller.signal);
      if (controller.signal.aborted) return;
      const result = images.length
        ? await uploadCommunityImages(post, images, acknowledgement.id, setProgress, controller.signal)
        : await api.submit(post, acknowledgement.id, controller.signal);
      if (controller.signal.aborted) return;
      setPost(emptyPost);
      setImages([]);
      setPickerVersion((value) => value + 1);
      setAcknowledged(false);
      onSubmitted(result);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(communityError(failure, 'submit'));
      if (failure.code === 'COMMUNITY_ACKNOWLEDGEMENT_REQUIRED') setAcknowledged(false);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting.current) onClose();
      }}
      title="Create a post"
      description="Share something that helps a colleague stay secure."
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="community-create-form" disabled={busy}>
            <Send className="size-4" aria-hidden="true" />
            {busy ? 'Submitting…' : 'Submit Post'}
          </Button>
        </>
      }
    >
      <form id="community-create-form" onSubmit={submit} noValidate className="space-y-5" aria-busy={busy}>
        <div className="flex items-center gap-3">
          <CommunityAvatar name={name} />
          <div>
            <p className="text-sm font-semibold text-navy-900">{name}</p>
            <p className="mt-0.5 text-xs text-slate-500">Visible to the community after approval</p>
          </div>
        </div>
        <label className="block text-sm font-semibold text-slate-700">
          Post title <span className="font-normal text-slate-500">(optional)</span>
          <Input
            className="mt-2"
            value={post.title}
            maxLength={200}
            onChange={update('title')}
            disabled={busy}
            placeholder="Give your post a short title"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Description
          <Textarea
            className="mt-2 min-h-44"
            value={post.body}
            maxLength={5000}
            onChange={update('body')}
            disabled={busy}
            required
            placeholder="Share a security tip, warning, or experience…"
            aria-describedby="community-character-count"
          />
        </label>
        <p id="community-character-count" className="!mt-2 text-right text-xs text-slate-500">
          {post.body.length.toLocaleString()} / 5,000
        </p>
        <CommunityImagePicker key={pickerVersion} options={options} disabled={busy} onChange={setImages} />
        {optionsError && (
          <p className="text-xs text-slate-600">
            Photo uploads are temporarily unavailable. You can still submit a text post.
          </p>
        )}
        {busy && images.length > 0 && (
          <div role="status" className="space-y-2 text-sm text-brand-800">
            <progress
              className="w-full accent-brand-600"
              max="100"
              value={progress}
              aria-label="Photo upload progress"
            />
            <p>{progress < 100 ? `Uploading photos: ${progress}%` : 'Upload received. Running security checks…'}</p>
          </div>
        )}
        <label className="block text-sm font-semibold text-slate-700">
          Category
          <Select className="mt-2" value={post.category} onChange={update('category')} disabled={busy} required>
            <option value="">Choose a topic</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {label(category)}
              </option>
            ))}
          </Select>
        </label>
        <div className="rounded-xl bg-brand-50 p-4 text-sm leading-6 text-slate-700">
          <p className="flex items-center gap-2 font-semibold text-navy-900">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            Share knowledge, protect information
          </p>
          <p className="mt-2">
            Do not share passwords, credentials, API keys, confidential EWA documents, restricted information, personal
            or customer data, or unredacted sensitive screenshots.
          </p>
          <p className="mt-2">
            For sensitive evidence, use the{' '}
            <Link to="/incidents" className="font-semibold text-brand-800 underline">
              approved incident-reporting process
            </Link>
            .
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-brand-800">
              Full sensitive-information notice
            </summary>
            <p className="mt-2">{DISCLAIMER_DEFINITION.summary}</p>
            <ul className="mt-2 list-disc pl-5">
              {DISCLAIMER_DEFINITION.prohibitedItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-2">{DISCLAIMER_DEFINITION.restrictedGuidance}</p>
          </details>
        </div>
        <label className="flex items-start gap-3 text-sm leading-6 text-slate-700">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-brand-600"
            checked={acknowledged}
            disabled={busy}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          <span>{DISCLAIMER_DEFINITION.confirmation}</span>
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-800">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
