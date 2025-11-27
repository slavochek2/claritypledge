import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MailIcon, CheckCircle2Icon, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { sendEndorsementInvitation, getCurrentUser } from "@/polymet/data/api";
import { toast } from "sonner";

interface InviteEndorsersProps {
  profileName: string;
  profileUrl: string;
}

export function InviteEndorsers({
  profileName,
  profileUrl,
}: InviteEndorsersProps) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(
    `I've taken the Clarity Pledge - a commitment to verify understanding before acting on assumptions. I'd love your endorsement to witness my commitment. It only takes a moment!`
  );
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!firstName.trim() || !email.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setIsSending(true);

    try {
      // Get current user's profile ID
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        throw new Error("You must be logged in to send invitations");
      }

      // Send the invitation
      const result = await sendEndorsementInvitation(
        currentUser.id,
        profileName,
        firstName,
        email,
        message,
        profileUrl
      );

      if (result.success) {
        setIsSent(true);
        toast.success(`Invitation sent to ${firstName}!`);
        
        // Reset after showing success
        setTimeout(() => {
          setIsSent(false);
          setFirstName("");
          setEmail("");
          setOpen(false);
        }, 2000);
      } else {
        throw new Error(result.error || "Failed to send invitation");
      }
    } catch (err) {
      console.error("Error sending invitation:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to send invitation";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSending(false);
    }
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
          Invite Someone
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite Someone to Endorse Your Pledge</DialogTitle>
          <DialogDescription>
            Send a personal invitation. They'll receive an email with a direct link to endorse your commitment.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSend} className="space-y-6 pt-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* First Name Field */}
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-sm font-medium">
              Their First Name
            </Label>
            <Input
              id="firstName"
              type="text"
              placeholder="Sarah"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              className="text-base bg-background"
              disabled={isSending}
            />
            <p className="text-xs text-muted-foreground">
              Personalized invitations get 5x more responses
            </p>
          </div>

          {/* Email Field */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              Their Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="sarah@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="text-base bg-background"
              disabled={isSending}
            />
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
              className="resize-none bg-background"
              disabled={isSending}
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
                Subject: {profileName} invited you to endorse their Clarity Pledge
              </p>
              <p className="text-muted-foreground">
                Hi {firstName || "[Name]"}! {message}
              </p>
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
              disabled={isSending}
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
                  Send Invitation
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
