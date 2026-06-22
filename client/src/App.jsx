import { useEffect, useRef, useState } from 'react';
import { api } from './lib/api.js';
import { Stepper, Banner } from './components/ui.jsx';
import ManageModal from './components/ManageModal.jsx';
import Upload from './steps/Upload.jsx';
import Extract from './steps/Extract.jsx';
import Review from './steps/Review.jsx';
import RatesQuote from './steps/RatesQuote.jsx';
import ExportStep from './steps/Export.jsx';

export default function App() {
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [files, setFiles] = useState({ plansFile: null, energyFile: null });
  const [takeoff, setTakeoff] = useState(null);
  const [builderMatch, setBuilderMatch] = useState(null);
  const [pricing, setPricing] = useState({ mode: 'auto', builderId: null, lineOverrides: {} });
  const [computed, setComputed] = useState(null);
  const [products, setProducts] = useState([]);
  const [builders, setBuilders] = useState([]);
  const [modal, setModal] = useState(null); // { tab }
  const [backendOk, setBackendOk] = useState(true);
  const debounce = useRef(null);

  const goto = (s) => {
    setStep(s);
    setMaxReached((m) => Math.max(m, s));
  };

  const loadData = () => {
    api.listProducts().then(setProducts).catch(() => {});
    api.listBuilders().then(setBuilders).catch(() => {});
  };

  useEffect(() => {
    api.health().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    loadData();
  }, []);

  // Debounced live recompute whenever the model or pricing changes.
  useEffect(() => {
    if (!takeoff) return;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const pricingForCompute = pricing.mode === 'none' ? { mode: 'none' } : pricing;
      api.takeoff(takeoff, pricingForCompute).then(setComputed).catch(() => {});
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [takeoff, pricing]);

  const onExtractResult = (result) => {
    setTakeoff(result.takeoff);
    setBuilderMatch(result.builderMatch);
    // Pre-select the matched builder profile for auto-pricing.
    if (result.builderMatch?.matched) {
      setPricing((p) => ({ ...p, mode: 'auto', builderId: result.builderMatch.builderId }));
    }
    goto(2);
  };

  const onLoadJob = (job) => {
    setTakeoff(job.takeoff);
    setPricing(job.pricing?.mode ? job.pricing : { mode: 'auto', builderId: null, lineOverrides: {} });
    setBuilderMatch({ matched: false });
    setMaxReached(4);
    setStep(2);
  };

  const reset = () => {
    setStep(0); setMaxReached(0); setFiles({ plansFile: null, energyFile: null });
    setTakeoff(null); setComputed(null); setBuilderMatch(null);
    setPricing({ mode: 'auto', builderId: null, lineOverrides: {} });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <button onClick={reset} className="flex items-center gap-2">
            <span className="text-xl">🏠</span>
            <span className="font-semibold text-gray-900">Insulation Take-Off</span>
          </button>
          <div className="hidden md:block">
            <Stepper current={step} maxReached={maxReached} onJump={goto} />
          </div>
          <div className="flex items-center gap-1">
            <button className="btn-ghost" onClick={() => setModal({ tab: 'products' })}>Price list</button>
            <button className="btn-ghost" onClick={() => setModal({ tab: 'jobs' })}>Jobs</button>
            <button className="btn-ghost" onClick={() => setModal({ tab: 'settings' })} title="Settings">⚙</button>
          </div>
        </div>
        <div className="border-t px-4 py-2 md:hidden">
          <Stepper current={step} maxReached={maxReached} onJump={goto} />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {!backendOk && (
          <div className="mb-4">
            <Banner tone="error" title="Backend not reachable">
              Start the server: <code>cd server &amp;&amp; npm start</code> (Node 18+). The UI proxies <code>/api</code> to it.
            </Banner>
          </div>
        )}

        {step === 0 && <Upload files={files} setFiles={setFiles} onNext={() => goto(1)} />}
        {step === 1 && (
          <Extract
            files={files}
            onResult={onExtractResult}
            onBack={() => goto(0)}
            onOpenSettings={() => setModal({ tab: 'settings' })}
          />
        )}
        {step === 2 && takeoff && (
          <Review
            takeoff={takeoff}
            setTakeoff={setTakeoff}
            computed={computed}
            builderMatch={builderMatch}
            plansFile={files.plansFile}
            onBack={() => goto(1)}
            onNext={() => goto(3)}
          />
        )}
        {step === 3 && takeoff && (
          <RatesQuote
            pricing={pricing}
            setPricing={setPricing}
            computed={computed}
            products={products}
            builders={builders}
            builderMatch={builderMatch}
            onBack={() => goto(2)}
            onNext={() => goto(4)}
          />
        )}
        {step === 4 && takeoff && (
          <ExportStep takeoff={takeoff} pricing={pricing} computed={computed} onBack={() => goto(3)} />
        )}
      </main>

      {modal && (
        <ManageModal
          tab={modal.tab}
          onClose={() => setModal(null)}
          onData={loadData}
          onLoadJob={onLoadJob}
        />
      )}
    </div>
  );
}
