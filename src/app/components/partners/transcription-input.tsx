/**
 * @file transcription-input.tsx
 * @description Mic button with speech-to-text + text input fallback.
 * Shows real-time transcription while speaking.
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { Mic, MicOff, Square, Edit3 } from 'lucide-react';

interface TranscriptionInputProps {
  /** Called when user confirms the transcription */
  onConfirm: (text: string) => void;
  /** Placeholder text shown when empty */
  placeholder?: string;
  /** Label shown above the input */
  label?: string;
  /** Whether input is disabled */
  disabled?: boolean;
  /** Initial text value */
  initialValue?: string;
}

export function TranscriptionInput({
  onConfirm,
  placeholder = 'Tap the mic to speak, or type below...',
  label,
  disabled = false,
  initialValue = '',
}: TranscriptionInputProps) {
  const {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript,
  } = useSpeechToText();

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(initialValue);

  // Sync transcript to edit text when not editing
  useEffect(() => {
    if (!isEditing && transcript) {
      setEditText(transcript);
    }
  }, [transcript, isEditing]);

  // Set initial value
  useEffect(() => {
    if (initialValue) {
      setEditText(initialValue);
      setTranscript(initialValue);
    }
  }, [initialValue, setTranscript]);

  const displayText = isEditing ? editText : (transcript + interimTranscript);
  const hasContent = displayText.trim().length > 0;

  const handleMicToggle = () => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      setEditText('');
      startListening();
    }
  };

  const handleConfirm = () => {
    const finalText = isEditing ? editText : transcript;
    if (finalText.trim()) {
      onConfirm(finalText.trim());
    }
  };

  const handleStartEditing = () => {
    if (isListening) {
      stopListening();
    }
    setEditText(transcript || editText);
    setIsEditing(true);
  };

  const handleEditChange = (value: string) => {
    setEditText(value);
    setTranscript(value);
  };

  return (
    <div className="space-y-4">
      {label && (
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
      )}

      {/* Transcription display / edit area */}
      <div className="relative">
        {isEditing ? (
          <Textarea
            value={editText}
            onChange={(e) => handleEditChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[120px] pr-10"
            autoFocus
          />
        ) : (
          <div
            className={`min-h-[120px] p-3 rounded-md border bg-background ${
              isListening ? 'border-red-500 ring-2 ring-red-500/20' : 'border-input'
            }`}
          >
            {hasContent ? (
              <p className="text-foreground whitespace-pre-wrap">
                {transcript}
                {interimTranscript && (
                  <span className="text-muted-foreground">{interimTranscript}</span>
                )}
              </p>
            ) : (
              <p className="text-muted-foreground">{placeholder}</p>
            )}

            {/* Recording indicator */}
            {isListening && (
              <div className="absolute top-2 right-2 flex items-center gap-1.5">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs text-red-500 font-medium">Recording</span>
              </div>
            )}
          </div>
        )}

        {/* Edit button (only when not listening and has content) */}
        {!isListening && hasContent && !isEditing && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-8 w-8"
            onClick={handleStartEditing}
            disabled={disabled}
          >
            <Edit3 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        {/* Mic button - only show if supported */}
        {isSupported && (
          <Button
            variant={isListening ? 'destructive' : 'outline'}
            size="lg"
            onClick={handleMicToggle}
            disabled={disabled || isEditing}
            className="flex-shrink-0"
          >
            {isListening ? (
              <>
                <Square className="h-4 w-4 mr-2" />
                Stop
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 mr-2" />
                Record
              </>
            )}
          </Button>
        )}

        {/* Text-only fallback message */}
        {!isSupported && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <MicOff className="h-4 w-4" />
            Voice not supported — type your message
          </p>
        )}

        {/* Done editing button */}
        {isEditing && (
          <Button
            variant="outline"
            onClick={() => setIsEditing(false)}
            disabled={disabled}
          >
            Done Editing
          </Button>
        )}

        {/* Confirm button */}
        <Button
          onClick={handleConfirm}
          disabled={disabled || !hasContent || isListening}
          className="flex-1"
          size="lg"
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}
