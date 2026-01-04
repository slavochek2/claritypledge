import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Mic, MicOff, CheckCircle, ArrowRightLeft, Lightbulb } from 'lucide-react';
import {
  mockUsers,
  getIdeaById
} from '../data/mock-data';

type LivePhase = 'setup' | 'speaking' | 'playback' | 'rating' | 'result';

export function Live() {
  const navigate = useNavigate();
  const location = useLocation();
  const ideaId = (location.state as { ideaId?: string })?.ideaId || '1';

  const [phase, setPhase] = useState<LivePhase>('setup');
  const [isSpeaker, setIsSpeaker] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [listenerConfidence, setListenerConfidence] = useState(7);
  const [speakerRating, setSpeakerRating] = useState(6);

  const idea = getIdeaById(ideaId);
  const partner = mockUsers[0];

  const handleStartSession = (asSpeaker: boolean) => {
    setIsSpeaker(asSpeaker);
    setPhase('speaking');
  };

  const handleFinishSpeaking = () => {
    setPhase('playback');
  };

  const handleFinishPlayback = () => {
    setPhase('rating');
  };

  const handleSubmitRatings = () => {
    setPhase('result');
  };

  const renderSetup = () => (
    <div className="flex flex-col items-center justify-center flex-1 px-6">
      {/* Idea Card */}
      {idea && (
        <div className="w-full bg-white rounded-[20px] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-8">
          <div className="flex items-start gap-2 mb-3">
            <Lightbulb size={16} className="text-[#007AFF] mt-0.5 shrink-0" />
            <span className="text-[13px] font-medium text-[#007AFF]">Verifying Understanding On</span>
          </div>
          <p className="text-[17px] leading-relaxed text-gray-900">{idea.text}</p>
        </div>
      )}

      {/* Partner Info */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-xl">
          {partner.avatar}
        </div>
        <div>
          <p className="text-[15px] font-medium text-gray-900">{partner.name}</p>
          <p className="text-[13px] text-green-500">Connected</p>
        </div>
      </div>

      {/* Role Selection */}
      <div className="w-full space-y-3">
        <p className="text-[13px] text-gray-500 text-center mb-4">Choose your role to begin</p>

        <button
          onClick={() => handleStartSession(true)}
          className="w-full py-4 bg-[#007AFF] text-white rounded-2xl font-semibold text-[17px] transition-all hover:bg-[#0066DD] active:scale-[0.98]"
        >
          I'll Explain My Position
        </button>

        <button
          onClick={() => handleStartSession(false)}
          className="w-full py-4 bg-white text-gray-900 rounded-2xl font-semibold text-[17px] border border-gray-200 transition-all hover:bg-gray-50 active:scale-[0.98]"
        >
          I'll Listen First
        </button>
      </div>
    </div>
  );

  const renderSpeaking = () => (
    <div className="flex flex-col items-center justify-center flex-1 px-6">
      {/* Status */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        <span className="text-[15px] font-medium text-gray-900">
          {isSpeaker ? 'You are speaking' : `${partner.name} is speaking`}
        </span>
      </div>

      {/* Idea Reminder */}
      {idea && (
        <div className="w-full bg-blue-50 rounded-2xl p-4 mb-8">
          <p className="text-[15px] text-gray-700 text-center leading-relaxed">{idea.text}</p>
        </div>
      )}

      {/* Visualization */}
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center mb-8 shadow-lg shadow-blue-500/30">
        <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
          <Mic size={40} className="text-white" />
        </div>
      </div>

      {/* Instructions */}
      <p className="text-[14px] text-gray-500 text-center mb-8 max-w-[280px]">
        {isSpeaker
          ? 'Explain your position clearly. Take your time.'
          : 'Listen carefully. You\'ll play it back next.'}
      </p>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setIsMuted(!isMuted)}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}
        >
          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
        </button>

        <button
          onClick={handleFinishSpeaking}
          className="px-8 py-3 bg-[#007AFF] text-white rounded-full font-semibold text-[15px] transition-all hover:bg-[#0066DD] active:scale-95"
        >
          {isSpeaker ? 'Done Speaking' : 'Ready to Play Back'}
        </button>
      </div>
    </div>
  );

  const renderPlayback = () => (
    <div className="flex flex-col items-center justify-center flex-1 px-6">
      {/* Status */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
        <span className="text-[15px] font-medium text-gray-900">
          {!isSpeaker ? 'Your turn to explain back' : `${partner.name} is explaining back`}
        </span>
      </div>

      {/* Prompt */}
      <div className="w-full bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-8">
        <p className="text-[13px] font-medium text-gray-500 mb-2">Play back what you understood</p>
        <p className="text-[15px] text-gray-700 leading-relaxed">
          "So what I heard you saying is that you believe..."
        </p>
      </div>

      {/* Visualization */}
      <div className="w-32 h-32 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center mb-8 shadow-lg shadow-green-500/30">
        <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center">
          <ArrowRightLeft size={36} className="text-white" />
        </div>
      </div>

      {/* Controls */}
      <button
        onClick={handleFinishPlayback}
        className="px-8 py-3 bg-[#007AFF] text-white rounded-full font-semibold text-[15px] transition-all hover:bg-[#0066DD] active:scale-95"
      >
        Done Playing Back
      </button>
    </div>
  );

  const renderRating = () => (
    <div className="flex flex-col items-center justify-center flex-1 px-6">
      <h2 className="text-[20px] font-semibold text-gray-900 mb-8">Rate the Understanding</h2>

      {/* Listener Rating */}
      <div className="w-full bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-4">
        <p className="text-[13px] font-medium text-gray-500 mb-3">
          {!isSpeaker ? 'How confident are you in your understanding?' : `${partner.name}'s confidence`}
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="10"
            value={listenerConfidence}
            onChange={(e) => setListenerConfidence(Number(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[#007AFF]"
          />
          <span className="text-[24px] font-semibold text-gray-900 tabular-nums w-10 text-center">
            {listenerConfidence}
          </span>
        </div>
      </div>

      {/* Speaker Rating */}
      <div className="w-full bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-8">
        <p className="text-[13px] font-medium text-gray-500 mb-3">
          {isSpeaker ? 'How accurate was the playback?' : `${partner.name}'s accuracy rating`}
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="10"
            value={speakerRating}
            onChange={(e) => setSpeakerRating(Number(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-[#007AFF]"
          />
          <span className="text-[24px] font-semibold text-gray-900 tabular-nums w-10 text-center">
            {speakerRating}
          </span>
        </div>
      </div>

      {/* Understanding Gap */}
      <div className="text-center mb-8">
        <p className="text-[13px] text-gray-500 mb-1">Understanding Gap</p>
        <p className={`text-[28px] font-bold ${Math.abs(listenerConfidence - speakerRating) <= 2 ? 'text-green-600' : 'text-amber-600'}`}>
          {Math.abs(listenerConfidence - speakerRating)}
        </p>
      </div>

      <button
        onClick={handleSubmitRatings}
        className="w-full py-4 bg-[#007AFF] text-white rounded-2xl font-semibold text-[17px] transition-all hover:bg-[#0066DD] active:scale-[0.98]"
      >
        Submit Ratings
      </button>
    </div>
  );

  const renderResult = () => (
    <div className="flex flex-col items-center justify-center flex-1 px-6">
      {/* Success Icon */}
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
        <CheckCircle size={40} className="text-green-600" />
      </div>

      <h2 className="text-[24px] font-semibold text-gray-900 mb-2">Understanding Verified!</h2>
      <p className="text-[15px] text-gray-500 text-center mb-8 max-w-[280px]">
        {partner.name} has certified that you understand their position.
      </p>

      {/* Stats */}
      <div className="w-full bg-white rounded-2xl p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-8">
        <div className="flex items-center justify-around">
          <div className="text-center">
            <p className="text-[28px] font-semibold text-gray-900">{listenerConfidence}</p>
            <p className="text-[12px] text-gray-400">Your Confidence</p>
          </div>
          <div className="w-px h-12 bg-gray-200" />
          <div className="text-center">
            <p className="text-[28px] font-semibold text-gray-900">{speakerRating}</p>
            <p className="text-[12px] text-gray-400">Accuracy</p>
          </div>
          <div className="w-px h-12 bg-gray-200" />
          <div className="text-center">
            <p className={`text-[28px] font-semibold ${Math.abs(listenerConfidence - speakerRating) <= 2 ? 'text-green-600' : 'text-amber-600'}`}>
              {Math.abs(listenerConfidence - speakerRating)}
            </p>
            <p className="text-[12px] text-gray-400">Gap</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="w-full space-y-3">
        <button
          onClick={() => setPhase('setup')}
          className="w-full py-4 bg-[#007AFF] text-white rounded-2xl font-semibold text-[17px] transition-all hover:bg-[#0066DD] active:scale-[0.98]"
        >
          Verify Another Idea
        </button>
        <button
          onClick={() => navigate('/prototype/premium/feed')}
          className="w-full py-4 bg-white text-gray-900 rounded-2xl font-semibold text-[17px] border border-gray-200 transition-all hover:bg-gray-50 active:scale-[0.98]"
        >
          Back to Ideas
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F2F2F7] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-200/50">
        <div className="flex items-center justify-between px-4 h-14 max-w-[500px] mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={24} className="text-gray-500" />
          </button>
          <h1 className="text-[17px] font-semibold text-gray-900">Live Session</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Progress Indicator */}
      <div className="px-6 pt-4 max-w-[500px] mx-auto w-full">
        <div className="flex gap-2">
          {['setup', 'speaking', 'playback', 'rating', 'result'].map((step, index) => {
            const phases = ['setup', 'speaking', 'playback', 'rating', 'result'];
            const currentIndex = phases.indexOf(phase);
            const isCompleted = index < currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <div
                key={step}
                className={`flex-1 h-1 rounded-full transition-all ${isCompleted || isCurrent ? 'bg-[#007AFF]' : 'bg-gray-200'}`}
              />
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col max-w-[500px] mx-auto w-full pt-4 pb-8">
        {phase === 'setup' && renderSetup()}
        {phase === 'speaking' && renderSpeaking()}
        {phase === 'playback' && renderPlayback()}
        {phase === 'rating' && renderRating()}
        {phase === 'result' && renderResult()}
      </div>
    </div>
  );
}
