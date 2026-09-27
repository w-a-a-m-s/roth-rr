'use client';

import { useRef, useState } from 'react';
import { useScenario } from '@/store/useScenario';
import { isPlanNameTaken } from '@/lib/planName';
import { TextInput } from '@/components/ui/inputs';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { IconButton, iconProps } from '@/components/ui/IconButton';

/**
 * Upload (import) a plan from a JSON file. The user is always prompted to name
 * the plan before it's imported, pre-filled with the file's own name.
 */
export function UploadPlanButton() {
	const importConfig = useScenario(s => s.importConfig);
	const configs = useScenario(s => s.configs);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [error, setError] = useState(false);
	const [nameOpen, setNameOpen] = useState(false);
	const [draft, setDraft] = useState('');
	const [name, setName] = useState('');
	const [nameSubmitted, setNameSubmitted] = useState(false);

	const onUploadClick = () => fileInputRef.current?.click();

	const onFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		const text = await file.text();
		let parsedName = '';
		try {
			const parsed = JSON.parse(text) as { household?: unknown; name?: string };
			if (!parsed.household) {
				setError(true);
				return;
			}
			parsedName = typeof parsed.name === 'string' ? parsed.name : '';
		} catch {
			setError(true);
			return;
		}
		setDraft(text);
		setName(parsedName);
		setNameSubmitted(false);
		setNameOpen(true);
	};

	const trimmed = name.trim();
	const nameTaken = isPlanNameTaken(configs, trimmed);
	const canImport = trimmed.length > 0 && !nameTaken;

	const saveImport = () => {
		setNameSubmitted(true);
		if (!canImport) return;
		if (!importConfig(draft, trimmed)) setError(true);
		setNameOpen(false);
		setDraft('');
		setName('');
		setNameSubmitted(false);
	};

	return (
		<>
			<IconButton title="Upload plan" onClick={onUploadClick}>
				<svg {...iconProps}>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<path d="M7 8l5-5 5 5" />
					<path d="M12 3v12" />
				</svg>
			</IconButton>
			<input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={onFileSelected} />

			<Modal
				open={nameOpen}
				onClose={() => setNameOpen(false)}
				title="Name your plan"
				size="sm"
				footer={
					<div className="flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setNameOpen(false)}>
							Cancel
						</Button>
						<Button onClick={saveImport} disabled={nameSubmitted && !canImport}>
							Import
						</Button>
					</div>
				}
			>
				<p className="mb-2 text-sm text-muted-2">Choose a name for the uploaded plan.</p>
				<TextInput
					value={name}
					onChange={value => {
						setName(value);
						setNameSubmitted(false);
					}}
					placeholder="New plan name"
				/>
				{nameSubmitted && nameTaken ? (
					<p className="mt-2 text-xs text-danger" role="alert">
						You already have a plan with this name. Choose a different one.
					</p>
				) : null}
				{nameSubmitted && !trimmed ? (
					<p className="mt-2 text-xs text-danger" role="alert">
						Enter a plan name to continue.
					</p>
				) : null}
			</Modal>

			<Modal
				open={error}
				onClose={() => setError(false)}
				title="Couldn't import plan"
				size="sm"
				footer={
					<div className="flex justify-end">
						<Button onClick={() => setError(false)}>OK</Button>
					</div>
				}
			>
				<p className="text-sm text-muted-2">That file isn&apos;t a valid plan. Please choose a JSON file that was downloaded from this app.</p>
			</Modal>
		</>
	);
}
