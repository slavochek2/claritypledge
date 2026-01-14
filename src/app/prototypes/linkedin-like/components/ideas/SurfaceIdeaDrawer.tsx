/**
 * @file SurfaceIdeaDrawer.tsx
 * @description Bottom sheet drawer for surfacing a new idea during a live meeting.
 * Creator automatically agrees with their own idea (no position selection needed).
 */
import { useState } from 'react';
import { Lightbulb, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';

interface SurfaceIdeaDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerName?: string;
  onSubmit?: (text: string) => void;
}

export function SurfaceIdeaDrawer({
  open,
  onOpenChange,
  partnerName = 'Alice',
  onSubmit,
}: SurfaceIdeaDrawerProps) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) return;

    // Creator always agrees with their own idea
    onSubmit?.(text.trim());

    // Show toast
    toast.success('Idea surfaced!', {
      description: `${partnerName} can now stake their position`,
    });

    // Reset form and close
    setText('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setText('');
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 justify-center">
              <Lightbulb className="w-5 h-5 text-blue-500" />
              Surface an Idea
            </DrawerTitle>
            <DrawerDescription className="text-center">
              What would you like to verify understanding on with {partnerName}?
            </DrawerDescription>
          </DrawerHeader>

          <div className="p-4">
            {/* Idea text input */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter an idea, claim, or point of discussion..."
              className="w-full min-h-[100px] p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
            <p className="mt-2 text-xs text-gray-500">
              You'll automatically be marked as agreeing with your own idea
            </p>
          </div>

          <DrawerFooter className="pb-8">
            <Button
              onClick={handleSubmit}
              disabled={!text.trim()}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Agree
            </Button>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
