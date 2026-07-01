import { useState } from 'react';
import { api } from '../lib/api.js';
import { Card, Banner } from '../components/ui.jsx';

function FileDrop({ label, file, onPick, optional }) {
  const [over, setOver] = useState(false);
  const pages = file?._pages;
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onPick(f);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition ${
        over ? 'border-accent bg-accent/5' : file ? 'border-green-300 bg-green-50/50' : 'border-gray-200 bg-gray-50/50 hover:border-gray-300'
      }`}
    >
      <input
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
      <div className="text-3xl">{file ? '📄' : '⬆️'}</div>
      <div className="text-sm font-semibold text-gray-800">
        {label} {optional && <span className="font-normal text-gray-400">(optional)</span>}
      </div>
      {file ? (
        <div className="text-xs text-gray-600">
          <div className="font-medium text-gray-800">{file.name}</div>
          <div>{(file.size / 1024 / 1024).toFixed(2)} MB {pages ? `· ${pages} pages` : ''}</div>
          <div className="mt-1 text-accent">Click to replace</div>
        </div>
      ) : (
        <div className="text-xs text-gray-400">Drag a PDF here or click to browse</div>
      )}
    </label>
  );
}

export default function Upload({ files, setFiles, onNext }) {
  const [checking, setChecking] = useState(false);
  const [addressCheck, setAddressCheck] = useState(null); // null | { plans, energyReport, status, score }

  const setPlans = (f) => {
    setFiles((s) => ({ ...s, plansFile: f }));
    setAddressCheck(null);
  };
  const setEnergy = (f) => {
    setFiles((s) => ({ ...s, energyFile: f }));
    setAddressCheck(null);
  };

  const handleExtractClick = async () => {
    // No report to compare against, or we've already run the check for this
    // file pair (and the user is clicking through the warning) — go straight in.
    if (!files.energyFile || addressCheck) {
      onNext();
      return;
    }
    setChecking(true);
    try {
      const result = await api.checkAddresses(files.plansFile, files.energyFile);
      setAddressCheck(result);
      if (result.status === 'match') onNext();
    } catch {
      // Don't let a failed pre-check block the pipeline — any real problem
      // (bad key, etc.) will surface on the extraction screen anyway.
      onNext();
    } finally {
      setChecking(false);
    }
  };

  const mismatch = addressCheck && addressCheck.status !== 'match';

  return (
    <Card
      title="Upload documents"
      subtitle="Drop the architectural plans (required) and the energy report (optional). With no energy report you still get a full measurement take-off."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FileDrop label="Architectural plans" file={files.plansFile} onPick={setPlans} />
        <FileDrop label="Energy report" file={files.energyFile} onPick={setEnergy} optional />
      </div>

      {!files.energyFile && files.plansFile && (
        <div className="mt-4">
          <Banner tone="warn" title="No energy report">
            That's fine — the app will produce measurements only. You can add R-values/products manually in
            Rates &amp; Quote, or export measurements as-is.
          </Banner>
        </div>
      )}

      {mismatch && (
        <div className="mt-4">
          <Banner tone="warn" title={addressCheck.status === 'mismatch' ? "Addresses don't match" : 'Could not confirm the addresses match'}>
            <div className="space-y-1">
              <p>
                {addressCheck.status === 'mismatch'
                  ? "The address on the plans and the address on the energy report don't look like the same property. Double-check you've uploaded the right pair of documents before continuing."
                  : "One of the documents didn't have a readable address, so we couldn't confirm the plans and the energy report describe the same property."}
              </p>
              <p><span className="font-medium">Plans:</span> {addressCheck.plans.address || '(no address found)'}</p>
              <p><span className="font-medium">Energy report:</span> {addressCheck.energyReport.address || '(no address found)'}</p>
            </div>
          </Banner>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button className="btn-primary" disabled={!files.plansFile || checking} onClick={handleExtractClick}>
          {checking ? 'Checking documents…' : mismatch ? 'Continue anyway →' : 'Extract with Claude →'}
        </button>
      </div>
    </Card>
  );
}
