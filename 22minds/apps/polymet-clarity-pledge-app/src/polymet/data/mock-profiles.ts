export interface Witness {
  id: string;
  name: string;
  linkedinUrl?: string;
  timestamp: string;
  isVerified: boolean;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  role?: string;
  linkedinUrl?: string;
  reason?: string;
  signedAt: string;
  isVerified: boolean;
  witnesses: Witness[];
  reciprocations: number;
  avatarColor?: string;
}

export const mockProfiles: Record<string, Profile> = {
  "alice-chen": {
    id: "alice-chen",
    name: "Alice Chen",
    email: "alice@example.com",
    role: "Product Designer",
    linkedinUrl: "https://linkedin.com/in/alicechen",
    reason:
      "I've seen too many projects fail because people talked past each other. This pledge is my commitment to really listen and make sure I understand before responding.",
    signedAt: "2024-01-15",
    isVerified: true,
    avatarColor: "#0044CC",
    witnesses: [
      {
        id: "1",
        name: "Bob Martinez",
        linkedinUrl: "https://linkedin.com/in/bobmartinez",
        timestamp: "2024-01-16",
        isVerified: true,
      },
      {
        id: "2",
        name: "Carol Williams",
        linkedinUrl: "https://linkedin.com/in/carolwilliams",
        timestamp: "2024-01-17",
        isVerified: true,
      },
      {
        id: "3",
        name: "David Kim",
        timestamp: "2024-01-18",
        isVerified: true,
      },
      {
        id: "4",
        name: "Emma Thompson",
        linkedinUrl: "https://linkedin.com/in/emmathompson",
        timestamp: "2024-01-19",
        isVerified: true,
      },
      {
        id: "5",
        name: "Frank Rodriguez",
        timestamp: "2024-01-20",
        isVerified: true,
      },
      {
        id: "6",
        name: "Grace Lee",
        timestamp: "2024-01-21",
        isVerified: false,
      },
      {
        id: "7",
        name: "Henry Wilson",
        timestamp: "2024-01-21",
        isVerified: false,
      },
    ],

    reciprocations: 3,
  },
  "john-doe": {
    id: "john-doe",
    name: "John Doe",
    email: "john@example.com",
    role: "Engineering Manager",
    reason:
      "As a manager, I want my team to feel heard. This pledge helps me practice active listening and creates psychological safety.",
    signedAt: "2024-01-10",
    isVerified: false,
    avatarColor: "#6B7280",
    witnesses: [
      {
        id: "6",
        name: "Sarah Johnson",
        linkedinUrl: "https://linkedin.com/in/sarahjohnson",
        timestamp: "2024-01-11",
        isVerified: true,
      },
      {
        id: "7",
        name: "Michael Brown",
        timestamp: "2024-01-12",
        isVerified: true,
      },
    ],

    reciprocations: 1,
  },
};

export function getProfile(id: string): Profile | undefined {
  return mockProfiles[id];
}

export function addWitness(
  profileId: string,
  witnessName: string,
  linkedinUrl?: string
): string {
  const profile = mockProfiles[profileId];
  if (profile) {
    const witnessId = Date.now().toString();
    const newWitness: Witness = {
      id: witnessId,
      name: witnessName,
      linkedinUrl,
      timestamp: new Date().toISOString().split("T")[0],
      isVerified: true, // Instant verification - no email needed
    };
    profile.witnesses.push(newWitness);
    return witnessId;
  }
  return "";
}

export function createProfile(
  name: string,
  email: string,
  role?: string,
  linkedinUrl?: string,
  reason?: string
): Profile {
  const id = name.toLowerCase().replace(/\s+/g, "-");
  const newProfile: Profile = {
    id,
    name,
    email,
    role,
    linkedinUrl,
    reason,
    signedAt: new Date().toISOString().split("T")[0],
    isVerified: false,
    witnesses: [],
    reciprocations: 0,
    avatarColor: "#0044CC",
  };
  mockProfiles[id] = newProfile;
  return newProfile;
}

export function verifyProfile(profileId: string): void {
  const profile = mockProfiles[profileId];
  if (profile) {
    profile.isVerified = true;
  }
}

export function getVerifiedProfiles(): Profile[] {
  return Object.values(mockProfiles).filter((profile) => profile.isVerified);
}

// Mock session management
let currentUserId: string | null = null;

export function setCurrentUser(userId: string): void {
  currentUserId = userId;
}

export function getCurrentUser(): Profile | null {
  return currentUserId ? mockProfiles[currentUserId] || null : null;
}

export function signOut(): void {
  currentUserId = null;
}

// Verify endorsement and auto-create profile for endorser
export function verifyEndorsement(
  profileId: string,
  witnessId: string
): Profile | null {
  const profile = mockProfiles[profileId];
  if (!profile) return null;

  const witness = profile.witnesses.find((w) => w.id === witnessId);
  if (!witness) return null;

  // Mark endorsement as verified
  witness.isVerified = true;

  // Auto-create profile for the endorser if they don't have one
  const endorserId = witness.name.toLowerCase().replace(/\s+/g, "-");
  if (!mockProfiles[endorserId]) {
    const endorserProfile = createProfile(
      witness.name,
      `${endorserId}@example.com`,
      undefined,
      witness.linkedinUrl
    );
    endorserProfile.isVerified = true;
    return endorserProfile;
  }

  return mockProfiles[endorserId] || null;
}
