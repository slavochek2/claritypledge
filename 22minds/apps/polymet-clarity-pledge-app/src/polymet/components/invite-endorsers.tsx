import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MailIcon, CheckCircle2Icon, PlusIcon, XIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface InviteEndorsersProps {
  profileName: string;
  profileUrl: string;
}

export function InviteEndorsers({
  profileName,
  profileUrl,
}: InviteEndorsersProps) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([""]);
  const [message, setMessage] = useState(
    `Hi! I've taken the Clarity Pledge - a commitment to verify understanding before acting on assumptions. I'd love your endorsement to witness my commitment. It only takes a moment!`
  );
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const addEmailField = () => {
    setEmails([...emails, ""]);
  };

  const removeEmailField = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index));
  };

  const updateEmail = (index: number, value: string) => {
    const newEmails = [...emails];
    newEmails[index] = value;
    setEmails(newEmails);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const validEmails = emails.filter((email) => email.trim() !== "");
    if (validEmails.length === 0) return;

    setIsSending(true);

    // Simulate sending emails
    setTimeout(() => {
      setIsSending(false);
      setIsSent(true);

      // Reset after showing success
      setTimeout(() => {
        setIsSent(false);
        setOpen(false);
        setEmails([""]);
      }, 2000);
    }, 1500);
  };

  if (isSent) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="lg" className="w-full">
            <MailIcon className="w-4 h-4 mr-2" />
            Invite Endorsers
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <div className="text-center space-y-4 py-8">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-[#0044CC] dark:bg-blue-500 flex items-center justify-center animate-in zoom-in duration-500">
                <CheckCircle2Icon className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">Invitations Sent!</h3>
              <p className="text-sm text-muted-foreground">
                Your invitations have been sent successfully
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="w-full">
          <MailIcon className="w-4 h-4 mr-2" />
          Invite Endorsers
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite People to Endorse Your Pledge</DialogTitle>
          <DialogDescription>
            Send personal invitations to people you know. They'll receive an
            email with a direct link to endorse your commitment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSend} className="space-y-6 pt-4">
          {/* Email Fields */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Email Addresses</Label>
            {emails.map((email, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="email"
                  placeholder="colleague@example.com"
                  value={email}
                  onChange={(e) => updateEmail(index, e.target.value)}
                  required={index === 0}
                  className="flex-1"
                />

                {emails.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeEmailField(index)}
                  >
                    <XIcon className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addEmailField}
              className="w-full"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Add Another Email
            </Button>
          </div>

          {/* Personal Message */}
          <div className="space-y-2">
            <Label htmlFor="message" className="text-sm font-medium">
              Personal Message
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="resize-none"
            />

            <p className="text-xs text-muted-foreground">
              This message will be included in the invitation email
            </p>
          </div>

          {/* Preview */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Email Preview
            </p>
            <div className="text-sm space-y-2">
              <p className="font-medium">
                Subject: {profileName} invited you to endorse their Clarity
                Pledge
              </p>
              <p className="text-muted-foreground">{message}</p>
              <p className="text-[#0044CC] dark:text-blue-400 font-medium">
                → Endorse {profileName}'s Pledge
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSending}
              className="flex-1 bg-[#0044CC] hover:bg-[#0033AA] text-white"
            >
              {isSending ? (
                <>Sending...</>
              ) : (
                <>
                  <MailIcon className="w-4 h-4 mr-2" />
                  Send Invitations
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
