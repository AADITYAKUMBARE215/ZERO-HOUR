import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateBlockProps {
  error: string;
  onRetry?: () => void;
  className?: string;
}

export default function ErrorStateBlock({ error, onRetry, className = '' }: ErrorStateBlockProps) {
  // Translate technical/raw errors into premium friendly explanations
  const isMissingApiKey = error.toLowerCase().includes('gemini_api_key') || error.toLowerCase().includes('key is missing');
  
  const friendlyTitle = isMissingApiKey 
    ? 'Gemini API Key Required' 
    : 'AI Coordination Briefing Paused';

  const friendlyMsg = isMissingApiKey
    ? 'To power real-time goal metrics, risk projections, and personalized coach feedback, please configure your GEMINI_API_KEY inside the Secrets panel of Google AI Studio.'
    : "We couldn't reach the AI right now. Your saved data is safe. Please try again in a moment.";

  return (
    <div className={`bg-rose-50/25 border border-rose-100/50 rounded-2xl p-6 flex flex-col items-center text-center justify-center space-y-4 shadow-xs ${className}`}>
      <div className="bg-rose-50 text-rose-500 p-3 rounded-full">
        <AlertCircle className="w-5.5 h-5.5" />
      </div>
      
      <div className="space-y-1.5 max-w-sm">
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 font-display">
          {friendlyTitle}
        </h4>
        <p className="text-xs text-slate-500 leading-relaxed font-medium">
          {friendlyMsg}
        </p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-350 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Try Again</span>
        </button>
      )}
    </div>
  );
}
